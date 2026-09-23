import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { API_TAGS } from "@/lib/api/tags";
import captureServerException from "@/lib/captureServerException";
import inviteCodesRequired from "@/lib/config/invite-codes-required";

const ROUTE = "/api/config/invite_code_required";

export const getInviteCodeRequired = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Invite code policy",
  description:
    "Whether registering an account on this auth server requires an invite code (the `invite_codes_required` server setting). Public; the registration form uses it to decide whether to ask for a code.",
  tags: [API_TAGS.configuration],
  auth: publicAccess(),
  responses: {
    200: {
      description: "The current policy",
      schema: z
        .object({
          error: z.literal(false),
          success: z.literal(true),
          message: z.string(),
          data: z.boolean().openapi({ description: "true when registration requires an invite code" }),
        })
        .openapi("InviteCodeRequiredResponse"),
    },
    500: {
      description: "The server setting could not be loaded",
      schema: z
        .object({ error: z.literal(true), success: z.literal(false), message: z.string() })
        .openapi("ConfigurationErrorResponse"),
    },
  },
  handler: async (ctx) => {
    const { db, redis } = ctx.context;

    let inviteCodeRequired: boolean;
    try {
      inviteCodeRequired = await inviteCodesRequired(db, redis.client);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_invite_code_required.inviteCodesRequired",
        route: ROUTE,
      });
      return ctx.json(500, {
        error: true,
        success: false,
        message: "Failed to load server setting!",
      });
    }

    return ctx.json(200, {
      error: false,
      success: true,
      message: "Successfully loaded server config setting!",
      data: inviteCodeRequired,
    });
  },
});
