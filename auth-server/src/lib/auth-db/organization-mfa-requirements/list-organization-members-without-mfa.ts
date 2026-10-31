import "server-only";
import type { OrganizationID, OrganizationMembershipRoleType } from "@schemavaults/auth-common";
import { assertOrganizationId, toNullableNumber, toNumber, type Db } from "./shared";
import type { OrganizationMfaGracePeriod } from "./types";

export interface OrganizationMemberWithoutMfa {
  uid: string;
  email: string;
  role: OrganizationMembershipRoleType;
  membership_created_at: number;
  /** Null while no grace period was started yet (status `pending`). */
  grace_period: OrganizationMfaGracePeriod | null;
}

/**
 * The organization's members (membership rows) who have no verified MFA
 * factor, with their grace period, soonest deadline first.
 */
export async function listOrganizationMembersWithoutMfa(
  db: Db,
  organization_id: OrganizationID,
): Promise<readonly OrganizationMemberWithoutMfa[]> {
  assertOrganizationId(organization_id);
  const rows = await db
    .selectFrom("organization_membership_roles as m")
    .innerJoin("users as u", "u.uid", "m.uid")
    .leftJoin("organization_mfa_grace_periods as g", (join) =>
      join.onRef("g.organization_id", "=", "m.organization_id").onRef("g.uid", "=", "m.uid"),
    )
    .where("m.organization_id", "=", organization_id)
    .where("u.service_account_app_id", "is", null)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("user_mfa_factors as f")
            .select("f.factor_id")
            .whereRef("f.uid", "=", "m.uid")
            .where("f.verified", "=", true),
        ),
      ),
    )
    .select([
      "m.uid",
      "u.email",
      "m.role",
      "m.created_at as membership_created_at",
      "g.reason",
      "g.started_at",
      "g.ends_at",
      "g.notified_at",
    ])
    .execute();

  const members = new Map<string, OrganizationMemberWithoutMfa>();
  for (const row of rows) {
    // (organization_id, uid, role) is the unique key: keep one entry per
    // user, preferring the owner role should a user hold two rows.
    const previous = members.get(row.uid);
    if (previous && previous.role === "owner") continue;
    members.set(row.uid, {
      uid: row.uid,
      email: row.email,
      role: row.role as OrganizationMembershipRoleType,
      membership_created_at: toNumber(row.membership_created_at),
      grace_period:
        row.reason !== null && row.started_at !== null && row.ends_at !== null
          ? {
              organization_id,
              uid: row.uid,
              reason: row.reason,
              started_at: toNumber(row.started_at),
              ends_at: toNumber(row.ends_at),
              notified_at: toNullableNumber(row.notified_at),
            }
          : null,
    });
  }
  return [...members.values()].sort(
    (a, b) =>
      (a.grace_period?.ends_at ?? Number.MAX_SAFE_INTEGER) -
      (b.grace_period?.ends_at ?? Number.MAX_SAFE_INTEGER),
  );
}
