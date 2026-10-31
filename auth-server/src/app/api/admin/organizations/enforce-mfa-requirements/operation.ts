import { z } from "@schemavaults/openapi-operations";
import { organizationIdSchema } from "@schemavaults/auth-common";
import { OrganizationMembershipRole } from "@/lib/api/domain-schemas/organizations";
import { OrganizationMfaGracePeriodReason } from "@/lib/api/domain-schemas/organization-mfa-requirements";
import { defineScheduledJobOperations } from "@/lib/api/scheduled-job-operations";
import { ErrorResponse } from "@/lib/api/schemas";
import {
  ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE,
  enforceOrganizationMfaRequirementsHandler,
} from "./enforce-handler";

const description =
  "Enforces the multi-factor authentication requirements of organizations: removes every member whose grace period ended while they still have no verified MFA factor (recording each removal, which the daily admin report lists), starts a grace period for members without MFA who have none yet (and emails them), deletes grace periods of members who enabled MFA or left, and retries the requirement emails that failed. " +
  "Members past their grace period already lose the use of their membership when it ends; this job removes the membership itself.";

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

// GET: the scheduled job (cron secret only); POST: platform administrators (session only).
export const {
  viaGet: enforceOrganizationMfaRequirementsViaGet,
  viaPost: enforceOrganizationMfaRequirementsViaPost,
} = defineScheduledJobOperations({
  path: ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE,
  summary: "Enforce organization MFA requirements",
  description,
  result: { description: "The requirements were enforced", schema: OrganizationMfaEnforcementResult },
  failure: { description: "The requirements could not be enforced", schema: ErrorResponse },
  run: ({ context, uid }) =>
    enforceOrganizationMfaRequirementsHandler({ db: context.db, redis: context.redis, uid }),
});
