import "server-only";
import type { OrganizationID } from "@schemavaults/auth-common";
import { assertUid, toNumber, type Db } from "./shared";
import type { OrganizationMfaGracePeriod } from "./types";

export interface UserOrganizationMfaRequirement {
  organization_id: OrganizationID;
  organization_name: string;
  grace_period_days: number;
  required_since: number;
  /** The user's running (or ended) grace period, null when none was started. */
  grace_period: Pick<OrganizationMfaGracePeriod, "reason" | "started_at" | "ends_at"> | null;
}

/** The organizations the user is a member of (membership rows) that require MFA. */
export async function listUserOrganizationMfaRequirements(
  db: Db,
  uid: string,
): Promise<readonly UserOrganizationMfaRequirement[]> {
  assertUid(uid);
  const rows = await db
    .selectFrom("organization_membership_roles as m")
    .innerJoin("organization_mfa_requirements as r", "r.organization_id", "m.organization_id")
    .innerJoin("organizations as o", "o.organization_id", "m.organization_id")
    .leftJoin("organization_mfa_grace_periods as g", (join) =>
      join.onRef("g.organization_id", "=", "m.organization_id").onRef("g.uid", "=", "m.uid"),
    )
    .where("m.uid", "=", uid)
    .select([
      "m.organization_id",
      "o.name as organization_name",
      "r.grace_period_days",
      "r.required_since",
      "g.reason",
      "g.started_at",
      "g.ends_at",
    ])
    .orderBy("o.name", "asc")
    .execute();

  const requirements = new Map<OrganizationID, UserOrganizationMfaRequirement>();
  for (const row of rows) {
    if (requirements.has(row.organization_id)) continue;
    requirements.set(row.organization_id, {
      organization_id: row.organization_id,
      organization_name: row.organization_name,
      grace_period_days: Number(row.grace_period_days),
      required_since: toNumber(row.required_since),
      grace_period:
        row.reason !== null && row.started_at !== null && row.ends_at !== null
          ? { reason: row.reason, started_at: toNumber(row.started_at), ends_at: toNumber(row.ends_at) }
          : null,
    });
  }
  return [...requirements.values()];
}
