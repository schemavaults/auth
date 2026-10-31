import "server-only";
import type { OrganizationID } from "@schemavaults/auth-common";
import {
  computeOrganizationMfaGracePeriodEndsAt,
  type OrganizationMfaGracePeriodReason,
} from "@/lib/organization-mfa-requirements/policy";
import { assertOrganizationId, assertUid, toGracePeriod, toNumber, type Db } from "./shared";
import type { OrganizationMfaGracePeriod } from "./types";

export interface StartMissingOrganizationMfaGracePeriodsParams {
  now: number;
  /** Only this organization's members. */
  organization_id?: OrganizationID;
  /** Only this user's memberships. */
  uid?: string;
  /**
   * Recorded (and used for the email's wording). When omitted it is derived
   * per member: `requirement_enabled` for memberships older than the
   * requirement, `mfa_removed` for later ones (they had to have MFA to join).
   */
  reason?: OrganizationMfaGracePeriodReason;
}

/**
 * Starts a grace period for every member (membership row) of an
 * organization that requires MFA who has no verified factor and no grace
 * period yet, ending `grace_period_days` of that organization from `now`.
 * Resolves to the grace periods it started (their emails are still to be
 * sent).
 */
export async function startMissingOrganizationMfaGracePeriods(
  db: Db,
  { now, organization_id, uid, reason }: StartMissingOrganizationMfaGracePeriodsParams,
): Promise<readonly OrganizationMfaGracePeriod[]> {
  if (organization_id !== undefined) assertOrganizationId(organization_id);
  if (uid !== undefined) assertUid(uid);

  let query = db
    .selectFrom("organization_membership_roles as m")
    .innerJoin("organization_mfa_requirements as r", "r.organization_id", "m.organization_id")
    .innerJoin("users as u", "u.uid", "m.uid")
    .where("u.service_account_app_id", "is", null)
    .where((eb) =>
      eb.and([
        eb.not(
          eb.exists(
            eb
              .selectFrom("user_mfa_factors as f")
              .select("f.factor_id")
              .whereRef("f.uid", "=", "m.uid")
              .where("f.verified", "=", true),
          ),
        ),
        eb.not(
          eb.exists(
            eb
              .selectFrom("organization_mfa_grace_periods as g")
              .select("g.uid")
              .whereRef("g.organization_id", "=", "m.organization_id")
              .whereRef("g.uid", "=", "m.uid"),
          ),
        ),
      ]),
    )
    .select([
      "m.organization_id",
      "m.uid",
      "m.created_at as membership_created_at",
      "r.required_since",
      "r.grace_period_days",
    ]);
  if (organization_id !== undefined) {
    query = query.where("m.organization_id", "=", organization_id);
  }
  if (uid !== undefined) {
    query = query.where("m.uid", "=", uid);
  }
  const candidates = await query.execute();
  if (candidates.length === 0) return [];

  const rows = new Map<string, OrganizationMfaGracePeriod>();
  for (const candidate of candidates) {
    const key = `${candidate.organization_id}\u0000${candidate.uid}`;
    if (rows.has(key)) continue;
    rows.set(key, {
      organization_id: candidate.organization_id,
      uid: candidate.uid,
      reason:
        reason ??
        (toNumber(candidate.membership_created_at) < toNumber(candidate.required_since)
          ? "requirement_enabled"
          : "mfa_removed"),
      started_at: now,
      ends_at: computeOrganizationMfaGracePeriodEndsAt(now, Number(candidate.grace_period_days)),
      notified_at: null,
    });
  }

  const inserted = await db
    .insertInto("organization_mfa_grace_periods")
    .values([...rows.values()])
    .onConflict((oc) => oc.columns(["organization_id", "uid"]).doNothing())
    .returningAll()
    .execute();
  return inserted.map(toGracePeriod);
}
