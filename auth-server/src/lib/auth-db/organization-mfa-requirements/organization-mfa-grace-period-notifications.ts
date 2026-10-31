import "server-only";
import type { OrganizationID } from "@schemavaults/auth-common";
import { assertOrganizationId, assertUid, toGracePeriod, type Db } from "./shared";
import type { OrganizationMfaGracePeriod } from "./types";

export interface OrganizationMfaGracePeriodAwaitingNotification extends OrganizationMfaGracePeriod {
  email: string;
  organization_name: string;
}

/**
 * Running grace periods whose email was not sent yet (just started, or a
 * previous send failed), optionally narrowed to one organization or user.
 */
export async function listOrganizationMfaGracePeriodsAwaitingNotification(
  db: Db,
  { now, organization_id, uid }: { now: number; organization_id?: OrganizationID; uid?: string },
): Promise<readonly OrganizationMfaGracePeriodAwaitingNotification[]> {
  if (organization_id !== undefined) assertOrganizationId(organization_id);
  if (uid !== undefined) assertUid(uid);
  let query = db
    .selectFrom("organization_mfa_grace_periods as g")
    .innerJoin("users as u", "u.uid", "g.uid")
    .innerJoin("organizations as o", "o.organization_id", "g.organization_id")
    .where("g.notified_at", "is", null)
    .where("g.ends_at", ">", now)
    .selectAll("g")
    .select(["u.email", "o.name as organization_name"])
    .orderBy("g.started_at", "asc");
  if (organization_id !== undefined) {
    query = query.where("g.organization_id", "=", organization_id);
  }
  if (uid !== undefined) {
    query = query.where("g.uid", "=", uid);
  }
  const rows = await query.execute();
  return rows.map((row) => ({
    ...toGracePeriod(row),
    email: row.email,
    organization_name: row.organization_name,
  }));
}

/** Records that the grace period's email was sent. */
export async function markOrganizationMfaGracePeriodNotified(
  db: Db,
  { organization_id, uid, notified_at }: { organization_id: OrganizationID; uid: string; notified_at: number },
): Promise<void> {
  await db
    .updateTable("organization_mfa_grace_periods")
    .set({ notified_at })
    .where("organization_id", "=", organization_id)
    .where("uid", "=", uid)
    .execute();
}
