import "server-only";
import type { OrganizationID, OrganizationMembershipRoleType } from "@schemavaults/auth-common";
import type { OrganizationMfaGracePeriodReason } from "@/lib/organization-mfa-requirements/policy";
import { toNumber, type Db } from "./shared";

export interface OrganizationMfaRemovalReportEntry {
  organization_id: OrganizationID;
  organization_name: string;
  uid: string;
  email: string;
  role: OrganizationMembershipRoleType;
  grace_period_reason: OrganizationMfaGracePeriodReason;
  grace_period_ended_at: number;
  removed_at: number;
}

export interface OrganizationMfaUpcomingRemoval {
  organization_id: OrganizationID;
  organization_name: string;
  uid: string;
  email: string;
  ends_at: number;
  /** Whether the member was emailed about the requirement. */
  notified: boolean;
}

export interface OrganizationMfaDailyReport {
  /** Organizations that require MFA now. */
  organizations_requiring_mfa: number;
  /** Members removed during the window, newest first (at most `list_limit`). */
  removals: readonly OrganizationMfaRemovalReportEntry[];
  removals_total: number;
  /** Members in a running grace period now (they must enable MFA before it ends). */
  in_grace_period: number;
  /** Members whose grace period ended without MFA, waiting for the next enforcement run. */
  awaiting_removal: number;
  /** Members in a running grace period who were not emailed yet (sending failed or is pending). */
  not_notified: number;
  /** Removals due between now and `upcoming_until`, soonest first (at most `list_limit`). */
  upcoming_removals: readonly OrganizationMfaUpcomingRemoval[];
  upcoming_removals_total: number;
}

/**
 * The organization MFA requirement activity the daily admin report shows:
 * the enforcement job's removals during `[since, now)` and the state of the
 * grace periods now (a snapshot: removal and MFA enrollment delete grace
 * period rows, so they cannot be counted over the window). Grace periods
 * only count while the member still has no verified factor and still holds
 * the membership (the job clears the others).
 */
export async function loadOrganizationMfaDailyReport(
  db: Db,
  {
    since,
    now,
    upcoming_until,
    list_limit,
  }: { since: number; now: number; upcoming_until: number; list_limit: number },
): Promise<OrganizationMfaDailyReport> {
  // Grace periods of members who still have no factor and still hold the membership.
  const openGracePeriods = () =>
    db
      .selectFrom("organization_mfa_grace_periods as g")
      .where((eb) =>
        eb.and([
          eb.not(
            eb.exists(
              eb
                .selectFrom("user_mfa_factors as f")
                .select("f.factor_id")
                .whereRef("f.uid", "=", "g.uid")
                .where("f.verified", "=", true),
            ),
          ),
          eb.exists(
            eb
              .selectFrom("organization_membership_roles as m")
              .select("m.uid")
              .whereRef("m.organization_id", "=", "g.organization_id")
              .whereRef("m.uid", "=", "g.uid"),
          ),
        ]),
      );

  const [
    requirements,
    removals,
    removalsTotal,
    inGracePeriod,
    awaiting,
    notNotified,
    upcoming,
    upcomingTotal,
  ] = await Promise.all([
    db
      .selectFrom("organization_mfa_requirements")
      .select((eb) => eb.fn.countAll<string | number>().as("count"))
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("organization_mfa_removals as r")
      .innerJoin("users as u", "u.uid", "r.uid")
      .innerJoin("organizations as o", "o.organization_id", "r.organization_id")
      .where("r.removed_at", ">=", since)
      .where("r.removed_at", "<", now)
      .select([
        "r.organization_id",
        "o.name as organization_name",
        "r.uid",
        "u.email",
        "r.role",
        "r.grace_period_reason",
        "r.grace_period_ended_at",
        "r.removed_at",
      ])
      .orderBy("r.removed_at", "desc")
      .orderBy("o.name", "asc")
      .limit(list_limit)
      .execute(),
    db
      .selectFrom("organization_mfa_removals")
      .where("removed_at", ">=", since)
      .where("removed_at", "<", now)
      .select((eb) => eb.fn.countAll<string | number>().as("count"))
      .executeTakeFirstOrThrow(),
    openGracePeriods()
      .where("g.ends_at", ">", now)
      .select((eb) => eb.fn.countAll<string | number>().as("count"))
      .executeTakeFirstOrThrow(),
    openGracePeriods()
      .where("g.ends_at", "<=", now)
      .select((eb) => eb.fn.countAll<string | number>().as("count"))
      .executeTakeFirstOrThrow(),
    openGracePeriods()
      .where("g.ends_at", ">", now)
      .where("g.notified_at", "is", null)
      .select((eb) => eb.fn.countAll<string | number>().as("count"))
      .executeTakeFirstOrThrow(),
    openGracePeriods()
      .innerJoin("users as u", "u.uid", "g.uid")
      .innerJoin("organizations as o", "o.organization_id", "g.organization_id")
      .where("g.ends_at", ">", now)
      .where("g.ends_at", "<=", upcoming_until)
      .select(["g.organization_id", "o.name as organization_name", "g.uid", "u.email", "g.ends_at", "g.notified_at"])
      .orderBy("g.ends_at", "asc")
      .limit(list_limit)
      .execute(),
    openGracePeriods()
      .where("g.ends_at", ">", now)
      .where("g.ends_at", "<=", upcoming_until)
      .select((eb) => eb.fn.countAll<string | number>().as("count"))
      .executeTakeFirstOrThrow(),
  ]);

  return {
    organizations_requiring_mfa: toNumber(requirements.count),
    removals: removals.map((row) => ({
      organization_id: row.organization_id,
      organization_name: row.organization_name,
      uid: row.uid,
      email: row.email,
      role: row.role as OrganizationMembershipRoleType,
      grace_period_reason: row.grace_period_reason,
      grace_period_ended_at: toNumber(row.grace_period_ended_at),
      removed_at: toNumber(row.removed_at),
    })),
    removals_total: toNumber(removalsTotal.count),
    in_grace_period: toNumber(inGracePeriod.count),
    awaiting_removal: toNumber(awaiting.count),
    not_notified: toNumber(notNotified.count),
    upcoming_removals: upcoming.map((row) => ({
      organization_id: row.organization_id,
      organization_name: row.organization_name,
      uid: row.uid,
      email: row.email,
      ends_at: toNumber(row.ends_at),
      notified: row.notified_at !== null,
    })),
    upcoming_removals_total: toNumber(upcomingTotal.count),
  };
}
