import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { mfaFactorTypeSchema } from "@schemavaults/auth-common";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { MfaFactorStatus } from "@/lib/api/domain-schemas/mfa";
import { ErrorResponse, sessionErrorResponses, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/user/mfa/status/{factor_type}";

export const getMfaFactorTypeStatus = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Get my status for one MFA factor type",
  description:
    "Reports whether the caller has a verified factor of the given type (`enabled`) or an enrollment in progress (`pending`); the two are mutually exclusive. Unlike `GET /api/user/mfa/status` this includes unconfirmed enrollments, so the settings UI can resume a pending setup. The payload is returned raw, without a `success` envelope.",
  tags: [API_TAGS.mfa],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    params: z.object({
      factor_type: withOpenApi(mfaFactorTypeSchema, {
        description: "The factor type to report on",
        example: "totp",
      }),
    }),
  },
  responses: {
    200: { description: "The caller's status for that factor type", schema: MfaFactorStatus },
    ...validationErrorResponse,
    ...sessionErrorResponses,
    500: { description: "Failed to load MFA status", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    const { factor_type } = ctx.params;
    try {
      const mfaRegistry = new MfaRegistry(db);
      // Filter by factor_type in SQL and include in-progress (unverified)
      // enrollments so the status reflects a pending setup, not just active
      // factors.
      const factor = await mfaRegistry.getFactorByType({ uid: user.uid, factor_type });

      const payload = ((): z.input<typeof MfaFactorStatus> => {
        if (!factor) {
          return { enabled: false, pending: false };
        }
        if (factor.verified) {
          // Postgres returns BIGINT columns as strings; coerce to number.
          const verified_at_raw = factor.verified_at;
          return {
            enabled: true,
            pending: false,
            factor_id: factor.factor_id,
            factor_type,
            verified_at: verified_at_raw == null ? undefined : Number(verified_at_raw),
          };
        }
        // An unverified factor row means enrollment is in progress.
        return { enabled: false, pending: true, factor_id: factor.factor_id, factor_type };
      })();

      const parsed = MfaFactorStatus.safeParse(payload);
      if (!parsed.success) {
        await captureServerException(db, parsed.error, {
          op_name: "GET_status_for_factor_type_handler:response_schema_mismatch",
          route: ROUTE,
          uid: user.uid,
        });
        return ctx.json(500, { success: false, message: "Failed to load MFA status" });
      }
      return ctx.json(200, parsed.data);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_status_for_factor_type_handler",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to load MFA status" });
    }
  },
});
