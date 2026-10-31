import { requireAuth, type OperationHandlerResult, z } from "@schemavaults/openapi-operations";
import { organizationIdSchema } from "@schemavaults/auth-common";
import { defineOperation } from "@/lib/api/context";
import { OrganizationMembershipRole } from "@/lib/api/domain-schemas/organizations";
import { OrganizationMfaGracePeriodReason } from "@/lib/api/domain-schemas/organization-mfa-requirements";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import type { GuardedOperationContext } from "@/lib/api/legacy-route-props";
import { adminErrorResponses, ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE,
  enforceOrganizationMfaRequirementsHandler,
} from "./enforce-handler";

const AUTH_NOTES =
  "Scheduled jobs call this without a session by sending the deployment's cron secret as `Authorization: Bearer <CRON_SECRET>`; that check runs before the session guard (see the route's cron bypass middleware). Every other caller needs an administrator session.";

const description =
  "Enforces the multi-factor authentication requirements of organizations: removes every member whose grace period ended while they still have no verified MFA factor (recording each removal, which the daily admin report lists), starts a grace period for members without MFA who have none yet (and emails them), deletes grace periods of members who enabled MFA or left, and retries the requirement emails that failed. " +
  "Members past their grace period already lose the use of their membership when it ends; this scheduled job (a daily Vercel cron, or a host crontab entry for the `deploy/` stack) removes the membership itself. Both GET and POST run it so simple cron schedulers can call it.";

/** Session-guarded path: an administrator triggered the run by hand. */
function runForAdministrator(ctx: GuardedOperationContext): OperationHandlerResult {
  return enforceOrganizationMfaRequirementsHandler({
    db: ctx.context.db,
    redis: ctx.context.redis,
    uid: ctx.auth.user.uid,
  });
}

const OrganizationMfaEnforcementResult = z
  .object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      removed_members: z
        .array(
          z.object({
            organization_id: organizationIdSchema,
            uid: z.guid(),
            role: OrganizationMembershipRole,
            grace_period_reason: OrganizationMfaGracePeriodReason,
            grace_period_ended_at: z.number().openapi({ description: "Unix epoch milliseconds the member's grace period ended" }),
          }),
        )
        .readonly()
        .openapi({
          description:
            "Members removed from their organization by this run (also recorded for the daily admin report)",
        }),
      grace_periods_started: z.number().int(),
      grace_periods_cleared: z.number().int(),
      notifications_sent: z.number().int(),
      notifications_failed: z.number().int(),
    }),
  })
  .openapi("OrganizationMfaEnforcementResult");

const responses = {
  200: { description: "The requirements were enforced", schema: OrganizationMfaEnforcementResult },
  ...adminErrorResponses,
  500: { description: "The requirements could not be enforced", schema: ErrorResponse },
} as const;

export const enforceOrganizationMfaRequirementsViaGet = defineOperation({
  method: "get",
  path: ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE,
  summary: "Enforce organization MFA requirements",
  description,
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin", notes: AUTH_NOTES }),
  responses,
  handler: runForAdministrator,
});

export const enforceOrganizationMfaRequirementsViaPost = defineOperation({
  method: "post",
  path: ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE,
  summary: "Enforce organization MFA requirements (POST)",
  description,
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin", notes: AUTH_NOTES }),
  responses,
  handler: runForAdministrator,
});
