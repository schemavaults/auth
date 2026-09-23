import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { adminMfaFactorTypesSchema } from "@/lib/api/domain-schemas/admin";
import { adminErrorResponses, ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { MfaRegistry, UserRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { sendMfaSecurityAlertEmail } from "@/lib/mfa/send-mfa-security-alert-email";

const ROUTE = "/api/admin/users/{uid}/mfa";
const LEGACY_ROUTE = "/api/admin/users/[uid]/mfa";

const params = z.object({ uid: z.guid().openapi({ description: "uid of the target user" }) });

export const listUserMfaFactorTypes = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List a user's MFA factor types",
  description: "Reports which kinds of verified second factors (TOTP, passkeys) the user has enrolled.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: { params },
  responses: {
    200: {
      description: "The user's verified factor types",
      schema: z.object({ success: z.literal(true), data: z.object({ factor_types: adminMfaFactorTypesSchema }) }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    404: { description: "No such user", schema: ErrorResponse },
    500: { description: "Failed to list the user's factors", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const { db } = ctx.context;
    const target_uid = ctx.params.uid;
    try {
      const target = await new UserRegistry(db).getUserByUID(target_uid);
      if (!target) return ctx.json(404, { success: false, message: "User not found" });

      const factor_types = await new MfaRegistry(db).listVerifiedFactorTypesForUser(target_uid);
      return ctx.json(200, { success: true, data: { factor_types } });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_admin_list_factor_types_handler",
        route: LEGACY_ROUTE,
        uid: target_uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list user MFA factor types" });
    }
  },
});

export const resetUserMfa = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Reset a user's MFA",
  description:
    "Removes every second factor and recovery code of the user, so they log in with their password alone until they enroll again. The user is notified by e-mail.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: { params },
  responses: {
    200: { description: "All factors were removed", schema: z.object({ success: z.literal(true) }) },
    ...validationErrorResponse,
    ...adminErrorResponses,
    404: { description: "No such user", schema: ErrorResponse },
    500: { description: "Failed to reset the user's MFA", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const { db, redis, environment } = ctx.context;
    const target_uid = ctx.params.uid;
    try {
      const target = await new UserRegistry(db).getUserByUID(target_uid);
      if (!target) return ctx.json(404, { success: false, message: "User not found" });

      await new MfaRegistry(db).deleteAllFactorsForUser(target_uid);

      await sendMfaSecurityAlertEmail({
        to: target.email,
        action: "admin_reset",
        db,
        redis,
        environment,
      });

      return ctx.json(200, { success: true });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "DELETE_admin_reset_handler",
        route: LEGACY_ROUTE,
        uid: target_uid,
      });
      return ctx.json(500, { success: false, message: "Failed to reset user MFA" });
    }
  },
});
