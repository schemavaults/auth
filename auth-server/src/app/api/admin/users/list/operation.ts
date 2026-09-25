import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AdminUserRecord } from "@/lib/api/domain-schemas/admin";
import { adminErrorResponses, ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { UserRegistry, type UserDocument } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/users/list";

export const listAllUsers = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List every user",
  description:
    "Lists every registered account (humans and service accounts) with its verification, admin and disabled flags and profile fields.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  responses: {
    200: {
      description: "All users",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ users: z.array(AdminUserRecord).readonly() }),
      }),
    },
    ...adminErrorResponses,
    500: { description: "Failed to list users", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;

    let users: readonly UserDocument[];
    try {
      users = await new UserRegistry(db).listAllUsers();
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_users_handler.listAllUsers",
        route: ROUTE,
        uid: user.uid,
      });
      return ctx.json(500, { success: false, message: "Failed to list all users!" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully listed all users!",
      data: { users },
    });
  },
});
