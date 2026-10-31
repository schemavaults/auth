import "server-only";
import type { OrganizationID, OrganizationMembershipRoleType } from "@schemavaults/auth-common";
import type { Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { OrganizationMfaGracePeriodReason } from "@/lib/organization-mfa-requirements/policy";
import { toNumber } from "./shared";

export interface RemovedOrganizationMfaMember {
  organization_id: OrganizationID;
  uid: string;
  /** The membership role they lost (the highest one, should they have held two). */
  role: OrganizationMembershipRoleType;
  grace_period_reason: OrganizationMfaGracePeriodReason;
  grace_period_ended_at: number;
}

/**
 * Removes from their organization every member whose grace period ended
 * while they still have no verified factor: deletes the grace period and the
 * membership rows, and records each removal in ORGANIZATION_MFA_REMOVALS
 * (migration 00050). Run it in a transaction.
 */
export async function removeMembersPastOrganizationMfaGracePeriod(
  trx: Transaction<AuthDatabase>,
  now: number,
): Promise<readonly RemovedOrganizationMfaMember[]> {
  const expired = await trx
    .deleteFrom("organization_mfa_grace_periods as g")
    .where("g.ends_at", "<=", now)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("user_mfa_factors as f")
            .select("f.factor_id")
            .whereRef("f.uid", "=", "g.uid")
            .where("f.verified", "=", true),
        ),
      ),
    )
    .returning(["g.organization_id", "g.uid", "g.reason", "g.ends_at"])
    .execute();
  if (expired.length === 0) return [];

  const deletedMemberships = await trx
    .deleteFrom("organization_membership_roles")
    .where((eb) =>
      eb.or(
        expired.map((row) =>
          eb.and([eb("organization_id", "=", row.organization_id), eb("uid", "=", row.uid)]),
        ),
      ),
    )
    .returning(["organization_id", "uid", "role"])
    .execute();

  // Only memberships that were actually deleted are removals (a grace
  // period can outlive its membership until the job clears it).
  const lostRoles = new Map<string, OrganizationMembershipRoleType>();
  for (const row of deletedMemberships) {
    const key = `${row.organization_id}\u0000${row.uid}`;
    if (lostRoles.get(key) !== "owner") {
      lostRoles.set(key, row.role as OrganizationMembershipRoleType);
    }
  }
  const removed: RemovedOrganizationMfaMember[] = [];
  for (const row of expired) {
    const role = lostRoles.get(`${row.organization_id}\u0000${row.uid}`);
    if (role === undefined) continue;
    removed.push({
      organization_id: row.organization_id,
      uid: row.uid,
      role,
      grace_period_reason: row.reason,
      grace_period_ended_at: toNumber(row.ends_at),
    });
  }
  if (removed.length > 0) {
    await trx
      .insertInto("organization_mfa_removals")
      .values(removed.map((removal) => ({ ...removal, removed_at: now })))
      .execute();
  }
  return removed;
}
