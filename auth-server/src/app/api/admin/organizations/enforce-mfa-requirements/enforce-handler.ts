import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import { NextResponse } from "next/server";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import captureServerException from "@/lib/captureServerException";
import { enforceOrganizationMfaRequirements } from "@/lib/organization-mfa-requirements/organization-mfa-requirement-actions";
import type { RedisCache } from "@/lib/redis";

export const ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE = "/api/admin/organizations/enforce-mfa-requirements";

export interface EnforceOrganizationMfaRequirementsInputs {
  db: Kysely<AuthDatabase>;
  redis: RedisCache;
  /** The administrator who triggered the run; absent for the cron job. */
  uid?: string;
}

/**
 * One enforcement run of the organization MFA requirements, for the
 * scheduled job and for administrators. Shared by the session-guarded
 * operations and the cron-secret middleware, so both answer with the same
 * body.
 */
export async function enforceOrganizationMfaRequirementsHandler({
  db,
  redis,
  uid,
}: EnforceOrganizationMfaRequirementsInputs): Promise<Response> {
  try {
    const result = await enforceOrganizationMfaRequirements({ db, redis });
    const message: string =
      `Removed ${result.removed.length} member${result.removed.length === 1 ? "" : "s"} whose MFA grace period ended, ` +
      `started ${result.grace_periods_started} grace period${result.grace_periods_started === 1 ? "" : "s"}, ` +
      `cleared ${result.grace_periods_cleared}, ` +
      `sent ${result.notifications.sent} email${result.notifications.sent === 1 ? "" : "s"} (${result.notifications.failed} failed).`;
    console.log(`[${ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE}] ${message}`);
    return NextResponse.json({
      success: true,
      message,
      data: {
        removed_members: result.removed,
        grace_periods_started: result.grace_periods_started,
        grace_periods_cleared: result.grace_periods_cleared,
        notifications_sent: result.notifications.sent,
        notifications_failed: result.notifications.failed,
      },
    });
  } catch (e: unknown) {
    await captureServerException(db, e, {
      op_name: "enforce_organization_mfa_requirements_handler.enforceOrganizationMfaRequirements",
      route: ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE,
      uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to enforce the organization MFA requirements" },
      { status: 500 },
    );
  }
}
