import type { MfaEnrolledFactor } from "@schemavaults/auth-common";
import { requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MfaStatus } from "@/lib/api/domain-schemas/mfa";
import { ErrorResponse, sessionErrorResponses } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/mfa/status";

export const getMfaStatus = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get my MFA status",
  description:
    "Lists the caller's verified MFA factors (authenticator apps and passkeys) and how many recovery codes remain unused. Pending enrollments are not listed; use `GET /api/user/mfa/status/{factor_type}` for those. The payload is returned raw, without a `success` envelope.",
  tags: [API_TAGS.mfa],
  auth: requireAuth({ schemes: sessionSchemes }),
  responses: {
    200: { description: "The caller's MFA status", schema: MfaStatus },
    ...sessionErrorResponses,
    500: { description: "Failed to load MFA status", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    try {
      const mfaRegistry = new MfaRegistry(db);
      const [verifiedSummaries, recovery_codes_remaining] = await Promise.all([
        mfaRegistry.listVerifiedFactorsForUser(user.uid),
        mfaRegistry.countRecoveryCodesRemaining(user.uid),
      ]);

      const factors: MfaEnrolledFactor[] = verifiedSummaries.map((summary) => ({
        factor_id: summary.factor_id,
        factor_type: summary.factor_type,
        verified_at: summary.verified_at == null ? undefined : summary.verified_at,
      }));

      const parsed = MfaStatus.safeParse({
        enabled: factors.length > 0,
        factors,
        recovery_codes_remaining,
      });
      if (!parsed.success) {
        await captureServerException(db, parsed.error, {
          op_name: "GET_status_handler:response_schema_mismatch",
          route: ROUTE,
          uid: user.uid,
        });
        return ctx.json(500, { success: false, message: "Failed to load MFA status" });
      }
      return ctx.json(200, parsed.data);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_status_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to load MFA status" });
    }
  },
});
