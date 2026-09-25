import { inviteCodeFormatSchema, type InviteCode } from "@schemavaults/auth-common";
import { z, requireAuth, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { adminErrorResponses, ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { UserRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/invite-codes/{invite_code}/usages";
const LEGACY_ROUTE = "/api/admin/invite-codes/[invite_code]/usages";

export const countInviteCodeUsages = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Count invite code usages",
  description: "Returns how many accounts registered with the given invite code.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params: z.object({
      invite_code: withOpenApi(inviteCodeFormatSchema, { description: "The invite code", example: "WELCOME-2025" }),
    }),
  },
  responses: {
    200: {
      description: "The usage count",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ invite_code: z.string(), usage_count: z.number().int().nonnegative() }),
      }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to count usages", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const invite_code: InviteCode = ctx.params.invite_code;

    let usage_count: number;
    try {
      usage_count = await new UserRegistry(db).countInviteCodeUsages(invite_code);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_count_invite_code_usages.countInviteCodeUsages",
        route: LEGACY_ROUTE,
        uid: user.uid,
        context: { invite_code },
      });
      return ctx.json(500, { success: false, message: "Failed to count invite code usages!" });
    }

    if (typeof usage_count !== "number" || !Number.isFinite(usage_count)) {
      await captureServerException(
        db,
        new Error(
          `countInviteCodeUsages returned a non-numeric value for invite code '${invite_code}': ${String(usage_count)}`,
        ),
        {
          op_name: "GET_count_invite_code_usages.nonNumericResult",
          route: LEGACY_ROUTE,
          uid: user.uid,
          context: { invite_code, usage_count },
        },
      );
      return ctx.json(500, { success: false, message: "Failed to count invite code usages!" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully counted invite code usages!",
      data: { invite_code, usage_count },
    });
  },
});
