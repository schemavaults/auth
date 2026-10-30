import "server-only";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { OrganizationID } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  clearOrganizationMfaGracePeriodsForUser,
  deleteStaleOrganizationMfaGracePeriods,
  listOrganizationMfaGracePeriodsAwaitingNotification,
  markOrganizationMfaGracePeriodNotified,
  removeMembersPastOrganizationMfaGracePeriod,
  startMissingOrganizationMfaGracePeriods,
  userHasVerifiedMfaFactor,
  type OrganizationMfaGracePeriodAwaitingNotification,
  type RemovedOrganizationMfaMember,
} from "@/lib/auth-db/organization-mfa-requirements";
import captureServerException from "@/lib/captureServerException";
import MailServerNotConfiguredError from "@/lib/error/MailServerNotConfiguredError";
import sendOrganizationMfaRequiredEmail from "@/lib/mail/send-organization-mfa-required-email";
import type { RedisCache } from "@/lib/redis";

/** Emails sent at once while notifying grace periods. */
const NOTIFICATION_CONCURRENCY = 5;

export interface OrganizationMfaNotificationResult {
  sent: number;
  failed: number;
}

/**
 * Sends the `organization-mfa-required` email for every running grace
 * period whose email was not sent yet (optionally only one organization's
 * or one user's), and records each sent one. Never throws: failures are
 * recorded to the ERRORS table and the grace period stays unnotified, so the
 * enforcement job retries it. When no mail server is configured the first
 * failure ends the run (every other send would fail the same way).
 */
export async function notifyOrganizationMfaGracePeriods({
  db,
  redis,
  now,
  organization_id,
  uid,
  environment = getAppEnvironment(),
}: {
  db: Kysely<AuthDatabase>;
  redis: RedisCache;
  now: number;
  organization_id?: OrganizationID;
  uid?: string;
  environment?: SchemaVaultsAppEnvironment;
}): Promise<OrganizationMfaNotificationResult> {
  let pending: readonly OrganizationMfaGracePeriodAwaitingNotification[];
  try {
    pending = await listOrganizationMfaGracePeriodsAwaitingNotification(db, { now, organization_id, uid });
  } catch (e: unknown) {
    await captureServerException(db, e, {
      op_name: "notifyOrganizationMfaGracePeriods.listOrganizationMfaGracePeriodsAwaitingNotification",
      uid,
      context: { organization_id, nonFatal: true },
    });
    return { sent: 0, failed: 0 };
  }

  const result: OrganizationMfaNotificationResult = { sent: 0, failed: 0 };
  let mailServerMissing = false;
  const queue = [...pending];

  async function worker(): Promise<void> {
    for (let next = queue.shift(); next && !mailServerMissing; next = queue.shift()) {
      const grace_period = next;
      try {
        await sendOrganizationMfaRequiredEmail({
          db,
          redis,
          to: grace_period.email,
          organization_id: grace_period.organization_id,
          organization_name: grace_period.organization_name,
          reason: grace_period.reason,
          grace_period_ends_at: grace_period.ends_at,
          environment,
        });
        await markOrganizationMfaGracePeriodNotified(db, {
          organization_id: grace_period.organization_id,
          uid: grace_period.uid,
          notified_at: Date.now(),
        });
        result.sent += 1;
      } catch (e: unknown) {
        result.failed += 1;
        if (e instanceof MailServerNotConfiguredError) {
          mailServerMissing = true;
        }
        console.warn(
          `[notifyOrganizationMfaGracePeriods] Failed to notify ${grace_period.email} of the MFA requirement of '${grace_period.organization_id}':`,
          e,
        );
        await captureServerException(db, e, {
          op_name: "notifyOrganizationMfaGracePeriods.sendOrganizationMfaRequiredEmail",
          uid: grace_period.uid,
          context: { organization_id: grace_period.organization_id, nonFatal: true },
        });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(NOTIFICATION_CONCURRENCY, queue.length) }, () => worker()),
  );
  return result;
}

/**
 * Called after the user lost MFA factors (removed one, or an administrator
 * reset them): when they have no verified factor left, starts a grace period
 * in every organization they belong to that requires MFA and emails them.
 * Never throws (the MFA change already happened); the enforcement job starts
 * any grace period this misses.
 */
export async function startOrganizationMfaGracePeriodsForUser({
  db,
  redis,
  uid,
  environment = getAppEnvironment(),
}: {
  db: Kysely<AuthDatabase>;
  redis: RedisCache;
  uid: string;
  environment?: SchemaVaultsAppEnvironment;
}): Promise<void> {
  try {
    if (await userHasVerifiedMfaFactor(db, uid)) {
      return;
    }
    const now: number = Date.now();
    const started = await startMissingOrganizationMfaGracePeriods(db, { now, uid, reason: "mfa_removed" });
    if (started.length > 0) {
      await notifyOrganizationMfaGracePeriods({ db, redis, now, uid, environment });
    }
  } catch (e: unknown) {
    await captureServerException(db, e, {
      op_name: "startOrganizationMfaGracePeriodsForUser",
      uid,
      context: { nonFatal: true },
    });
  }
}

/**
 * Called after the user enrolled a factor: ends their grace periods. Never
 * throws; membership listings already ignore the grace periods of users with
 * a factor, and the enforcement job deletes any this misses.
 */
export async function clearOrganizationMfaGracePeriodsAfterEnrollment({
  db,
  uid,
}: {
  db: Kysely<AuthDatabase>;
  uid: string;
}): Promise<void> {
  try {
    await clearOrganizationMfaGracePeriodsForUser(db, uid);
  } catch (e: unknown) {
    await captureServerException(db, e, {
      op_name: "clearOrganizationMfaGracePeriodsAfterEnrollment",
      uid,
      context: { nonFatal: true },
    });
  }
}

export interface OrganizationMfaEnforcementResult {
  /** Members removed because their grace period ended without MFA. */
  removed: readonly RemovedOrganizationMfaMember[];
  /** Grace periods deleted because the user enrolled MFA or left the organization. */
  grace_periods_cleared: number;
  /** Grace periods started for members without MFA who had none. */
  grace_periods_started: number;
  notifications: OrganizationMfaNotificationResult;
}

/**
 * The enforcement run of every organization MFA requirement (the scheduled
 * job): clears grace periods that no longer apply, removes the members whose
 * grace period ended while they still have no MFA, starts grace periods for
 * members without MFA who have none yet, and sends the emails still owed.
 * Throws when a database step fails; email failures are only recorded.
 */
export async function enforceOrganizationMfaRequirements({
  db,
  redis,
  now = Date.now(),
  environment = getAppEnvironment(),
}: {
  db: Kysely<AuthDatabase>;
  redis: RedisCache;
  now?: number;
  environment?: SchemaVaultsAppEnvironment;
}): Promise<OrganizationMfaEnforcementResult> {
  const grace_periods_cleared: number = await deleteStaleOrganizationMfaGracePeriods(db);
  const removed = await db
    .transaction()
    .execute((trx) => removeMembersPastOrganizationMfaGracePeriod(trx, now));
  const started = await startMissingOrganizationMfaGracePeriods(db, { now });
  const notifications = await notifyOrganizationMfaGracePeriods({ db, redis, now, environment });
  return {
    removed,
    grace_periods_cleared,
    grace_periods_started: started.length,
    notifications,
  };
}
