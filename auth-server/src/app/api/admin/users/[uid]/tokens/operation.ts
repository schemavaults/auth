import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AdminIssuedToken, issuedTokenTypeSchema } from "@/lib/api/domain-schemas/admin";
import { adminErrorResponses, ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { listIssuedTokensForUser, type IssuedTokenRow } from "@/lib/auth-db/issued-tokens";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/users/{uid}/tokens";
const LEGACY_ROUTE = "/api/admin/users/[uid]/tokens";

export const listUserIssuedTokens = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List a user's issued tokens",
  description:
    "Lists the most recent 200 access / refresh tokens recorded for the user in the issued-tokens audit table, optionally filtered by kind.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params: z.object({ uid: z.guid().openapi({ description: "uid of the target user" }) }),
    query: z.object({
      token_type: issuedTokenTypeSchema.optional().openapi({ description: "Only list tokens of this kind" }),
    }),
  },
  responses: {
    200: {
      description: "The user's issued tokens",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ tokens: z.array(AdminIssuedToken).readonly() }),
      }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to list the tokens", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { db } = ctx.context;
    const target_uid = ctx.params.uid;
    const { token_type } = ctx.query;

    let tokens: readonly IssuedTokenRow[];
    try {
      tokens = await listIssuedTokensForUser(db, target_uid, { token_type });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_user_tokens_handler.listIssuedTokensForUser",
        route: LEGACY_ROUTE,
        uid: user.uid,
        context: { target_uid, token_type },
      });
      return ctx.json(500, { success: false, message: "Failed to list user tokens!" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully listed user tokens!",
      data: { tokens },
    });
  },
});
