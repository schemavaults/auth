import "server-only";
import {
  organizationIdSchema,
  type OrganizationID,
  type OrganizationMembershipRoleType,
} from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import {
  computeOrganizationMfaGracePeriodEndsAt,
  type OrganizationMfaGracePeriodReason,
} from "@/lib/organization-mfa-requirements/policy";
import type { OrganizationMfaGracePeriodRow } from "./organization-mfa-requirements-table";

/**
 * Organization MFA requirements (ORGANIZATION_MFA_REQUIREMENTS /
 * ORGANIZATION_MFA_GRACE_PERIODS, migration 00048). "Has MFA" means at
 * least one verified USER_MFA_FACTORS row (TOTP or passkey), the same test
 * the login MFA challenge applies. Only real membership rows are subject to
 * a requirement: service accounts (virtual members, authenticated by client
 * credentials) and platform administrators' virtual membership of the
 * (hardcoded, unconfigurable) owner organization are not.
 */

type Db = Kysely<AuthDatabase> | Transaction<AuthDatabase>;

function toNumber(value: unknown): number {
  return typeof value === "string" ? parseInt(value, 10) : Number(value);
}

function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : toNumber(value);
}

function assertOrganizationId(organization_id: string): asserts organization_id is OrganizationID {
  if (!organizationIdSchema.safeParse(organization_id).success) {
    throw new TypeError("Invalid organization ID!");
  }
}

function assertUid(uid: string): void {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
}

export interface OrganizationMfaRequirement {
  organization_id: OrganizationID;
  grace_period_days: number;
  required_since: number;
  updated_at: number;
  updated_by: string | null;
}

export interface OrganizationMfaGracePeriod {
  organization_id: OrganizationID;
  uid: string;
  reason: OrganizationMfaGracePeriodReason;
  started_at: number;
  ends_at: number;
  notified_at: number | null;
}

function toGracePeriod(row: OrganizationMfaGracePeriodRow): OrganizationMfaGracePeriod {
  return {
    organization_id: row.organization_id,
    uid: row.uid,
    reason: row.reason,
    started_at: toNumber(row.started_at),
    ends_at: toNumber(row.ends_at),
    notified_at: toNullableNumber(row.notified_at),
  };
}

/** The organization's MFA requirement, or null when it does not require MFA. */
export async function getOrganizationMfaRequirement(
  db: Db,
  organization_id: OrganizationID,
): Promise<OrganizationMfaRequirement | null> {
  assertOrganizationId(organization_id);
  const row = await db
    .selectFrom("organization_mfa_requirements")
    .where("organization_id", "=", organization_id)
    .selectAll()
    .executeTakeFirst();
  if (!row) return null;
  return {
    organization_id: row.organization_id,
    grace_period_days: Number(row.grace_period_days),
    required_since: toNumber(row.required_since),
    updated_at: toNumber(row.updated_at),
    updated_by: row.updated_by,
  };
}

export interface UpsertOrganizationMfaRequirementParams {
  organization_id: OrganizationID;
  grace_period_days: number;
  actor_uid: string;
  now: number;
}

export interface UpsertOrganizationMfaRequirementResult {
  requirement: OrganizationMfaRequirement;
  /** True when the organization did not require MFA before this call. */
  newly_required: boolean;
}

/**
 * Makes the organization require MFA, or changes the grace period of an
 * existing requirement (`required_since` and the grace periods already
 * running are kept: a new length applies to grace periods started later).
 * Locks the organization row, so concurrent calls for the same organization
 * are serialized; run it in a transaction. The caller checks that the
 * organization exists and is not a system organization.
 */
export async function upsertOrganizationMfaRequirement(
  trx: Transaction<AuthDatabase>,
  { organization_id, grace_period_days, actor_uid, now }: UpsertOrganizationMfaRequirementParams,
): Promise<UpsertOrganizationMfaRequirementResult> {
  assertOrganizationId(organization_id);
  assertUid(actor_uid);

  await trx
    .selectFrom("organizations")
    .where("organization_id", "=", organization_id)
    .select("organization_id")
    .forUpdate()
    .executeTakeFirstOrThrow();

  const existing = await getOrganizationMfaRequirement(trx, organization_id);
  if (existing) {
    await trx
      .updateTable("organization_mfa_requirements")
      .set({ grace_period_days, updated_at: now, updated_by: actor_uid })
      .where("organization_id", "=", organization_id)
      .execute();
    return {
      requirement: { ...existing, grace_period_days, updated_at: now, updated_by: actor_uid },
      newly_required: false,
    };
  }

  const requirement: OrganizationMfaRequirement = {
    organization_id,
    grace_period_days,
    required_since: now,
    updated_at: now,
    updated_by: actor_uid,
  };
  await trx.insertInto("organization_mfa_requirements").values(requirement).execute();
  return { requirement, newly_required: true };
}

/**
 * Stops requiring MFA. Every grace period of the organization goes with the
 * requirement (ON DELETE CASCADE). Resolves to false when it was not required.
 */
export async function deleteOrganizationMfaRequirement(
  db: Db,
  organization_id: OrganizationID,
): Promise<boolean> {
  assertOrganizationId(organization_id);
  const result = await db
    .deleteFrom("organization_mfa_requirements")
    .where("organization_id", "=", organization_id)
    .executeTakeFirst();
  return (result?.numDeletedRows ?? BigInt(0)) > BigInt(0);
}

/** Whether the user has at least one verified MFA factor. */
export async function userHasVerifiedMfaFactor(db: Db, uid: string): Promise<boolean> {
  assertUid(uid);
  const row = await db
    .selectFrom("user_mfa_factors")
    .select("factor_id")
    .where("uid", "=", uid)
    .where("verified", "=", true)
    .limit(1)
    .executeTakeFirst();
  return !!row;
}

/**
 * Whether the organization requires MFA and the user has no verified
 * factor: the check that refuses them membership (accepting an invitation,
 * a platform administrator's direct assignment).
 */
export async function wouldJoiningViolateOrganizationMfaRequirement(
  db: Db,
  organization_id: OrganizationID,
  uid: string,
): Promise<boolean> {
  const [requirement, has_mfa] = await Promise.all([
    getOrganizationMfaRequirement(db, organization_id),
    userHasVerifiedMfaFactor(db, uid),
  ]);
  return requirement !== null && !has_mfa;
}

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

/** Ends the user's grace periods (they enrolled a factor). Resolves to how many ended. */
export async function clearOrganizationMfaGracePeriodsForUser(db: Db, uid: string): Promise<number> {
  assertUid(uid);
  const result = await db
    .deleteFrom("organization_mfa_grace_periods")
    .where("uid", "=", uid)
    .executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0);
}

/**
 * The organizations whose membership the user lost the use of: their grace
 * period ended and they still have no verified factor. Membership listings
 * leave these out until the enforcement job removes the membership rows.
 */
export async function listMfaSuspendedOrganizationIdsForUser(
  db: Db,
  uid: string,
  now: number,
): Promise<readonly OrganizationID[]> {
  assertUid(uid);
  const rows = await db
    .selectFrom("organization_mfa_grace_periods as g")
    .where("g.uid", "=", uid)
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
    .select("g.organization_id")
    .execute();
  return rows.map((row) => row.organization_id);
}

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

/**
 * Deletes the grace periods that no longer apply: the user enrolled a
 * factor since, or is no longer a member of the organization. Resolves to
 * how many were deleted.
 */
export async function deleteStaleOrganizationMfaGracePeriods(db: Db): Promise<number> {
  const result = await db
    .deleteFrom("organization_mfa_grace_periods as g")
    .where((eb) =>
      eb.or([
        eb.exists(
          eb
            .selectFrom("user_mfa_factors as f")
            .select("f.factor_id")
            .whereRef("f.uid", "=", "g.uid")
            .where("f.verified", "=", true),
        ),
        eb.not(
          eb.exists(
            eb
              .selectFrom("organization_membership_roles as m")
              .select("m.uid")
              .whereRef("m.organization_id", "=", "g.organization_id")
              .whereRef("m.uid", "=", "g.uid"),
          ),
        ),
      ]),
    )
    .executeTakeFirst();
  return Number(result?.numDeletedRows ?? 0);
}

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
 * period rows, so they cannot be counted over the window). Grace periods only count while the member still
 * has no verified factor and still holds the membership (the job clears the
 * others).
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
