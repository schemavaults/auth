import type { InviteCodeDefinition as InviteCodeDefinitionType } from "@schemavaults/auth-common";
import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { InviteCodeDefinition } from "@/lib/api/domain-schemas/admin";
import {
  adminErrorResponses,
  ErrorResponse,
  ResourceCreationResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { UserRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import { ConflictError } from "@/lib/error/ConflictError";

const ROUTE = "/api/admin/invite-codes";

/** `created_at` may not be further than this from the server clock. */
const MAX_CREATED_AT_AGE_MS = 30_000;

export const listInviteCodes = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List invite codes",
  description: "Lists every registration invite code with its usage limit and creator.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  responses: {
    200: {
      description: "All invite codes",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ invite_codes: z.array(InviteCodeDefinition).readonly() }),
      }),
    },
    ...adminErrorResponses,
    500: { description: "Failed to list invite codes", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;

    let invite_codes: readonly InviteCodeDefinitionType[];
    try {
      invite_codes = await new UserRegistry(db).listAllInviteCodes();
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_invite_codes.listAllInviteCodes",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list all invite codes!" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully listed all invite codes!",
      data: { invite_codes },
    });
  },
});

export const createInviteCode = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Create an invite code",
  description:
    "Registers a new invite code. `created_at` must be within 30 seconds of the server clock (a stale definition is refused with 412) and `created_by` is overwritten with the caller's uid.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    body: {
      lenientContentType: true,
      schema: InviteCodeDefinition,
      description: "The invite code definition; `created_by` is ignored and set to the caller.",
    },
  },
  responses: {
    200: { description: "The invite code was created; `resource_id` is the code", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...adminErrorResponses,
    409: { description: "An invite code with that value already exists", schema: ErrorResponse },
    412: { description: "`created_at` is too far from the server clock", schema: ErrorResponse },
    500: { description: "Failed to store the invite code", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;

    if (Math.abs(ctx.body.created_at - Date.now()) > MAX_CREATED_AT_AGE_MS) {
      return ctx.json(412, {
        success: false,
        message: `Invite code definition 'created_at' too far in the past (over ${MAX_CREATED_AT_AGE_MS / 1000}s)!`,
      });
    }

    const new_invite_code: InviteCodeDefinitionType = { ...ctx.body, created_by: user.uid };

    try {
      await new UserRegistry(db).createInviteCode(new_invite_code);
    } catch (e: unknown) {
      if (e instanceof ConflictError) {
        return ctx.json(409, { success: false, message: e.message });
      }
      await captureServerException(db, e, {
        op_name: "POST_create_invite_code.createInviteCode",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to insert invite code into database" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully inserted invite code into database!",
      resource_id: new_invite_code.invite_code,
    });
  },
});
