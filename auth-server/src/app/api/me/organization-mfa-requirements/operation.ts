import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MyOrganizationMfaRequirement } from "@/lib/api/domain-schemas/organization-mfa-requirements";
import { ErrorResponse, sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  listUserOrganizationMfaRequirements,
  userHasVerifiedMfaFactor,
} from "@/lib/auth-db/organization-mfa-requirements";
import captureServerException from "@/lib/captureServerException";
import { getOrganizationMfaComplianceStatus } from "@/lib/organization-mfa-requirements/policy";

const ROUTE = "/api/me/organization-mfa-requirements";

export const listMyOrganizationMfaRequirements = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List my organizations that require MFA",
  description:
    "The organizations the caller is a member of that require multi-factor authentication, and where the caller stands: compliant (they have MFA), within a grace period (enable MFA before it ends to stay a member), or past it (the membership is suspended and will be removed). Includes memberships suspended by an ended grace period, which other membership listings leave out.",
  tags: [API_TAGS.account],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: {
      description: "The caller's organizations that require MFA",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({
          mfa_enabled: z.boolean().openapi({ description: "Whether the caller has a verified MFA factor" }),
          organizations: z.array(MyOrganizationMfaRequirement).readonly(),
        }),
      }),
    },
    ...sessionErrorResponses,
    500: { description: "Failed to list the requirements", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const { user } = ctx.auth;
    const { db } = ctx.context;
    try {
      const [mfa_enabled, requirements] = await Promise.all([
        userHasVerifiedMfaFactor(db, user.uid),
        listUserOrganizationMfaRequirements(db, user.uid),
      ]);
      const now: number = Date.now();
      return ctx.json(200, {
        success: true,
        message: "Successfully listed the organizations that require multi-factor authentication",
        data: {
          mfa_enabled,
          organizations: requirements.map((requirement) => ({
            organization_id: requirement.organization_id,
            organization_name: requirement.organization_name,
            grace_period_days: requirement.grace_period_days,
            required_since: requirement.required_since,
            status: mfa_enabled
              ? ("compliant" as const)
              : getOrganizationMfaComplianceStatus(requirement.grace_period?.ends_at ?? null, now),
            grace_period_reason: mfa_enabled ? null : (requirement.grace_period?.reason ?? null),
            grace_period_ends_at: mfa_enabled ? null : (requirement.grace_period?.ends_at ?? null),
          })),
        },
      });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_my_organization_mfa_requirements_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, {
        success: false,
        message: "Failed to list the organizations that require multi-factor authentication",
      });
    }
  },
});
