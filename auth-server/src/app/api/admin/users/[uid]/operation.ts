import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import {
  adminErrorResponses,
  ErrorResponse,
  ResourceCreationResponse,
  validationErrorResponse,
} from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { UserNotFoundError, UserRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/users/{uid}";

export const deleteUserAccount = defineOperation({
  method: "delete",
  path: ROUTE,
  summary: "Delete a user",
  description:
    "Permanently deletes a user account. Organizations whose only remaining member was this user are deleted with it (cascading to their apps, API servers, memberships and invitations). Administrators cannot delete their own account here.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params: z.object({ uid: z.guid().openapi({ description: "uid of the user to delete" }) }),
  },
  responses: {
    200: { description: "The user was deleted", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...adminErrorResponses,
    404: { description: "No such user", schema: ErrorResponse },
    500: { description: "Failed to delete the user", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const target_uid = ctx.params.uid;

    if (user.uid === target_uid) {
      return ctx.json(400, {
        success: false,
        message: "You cannot delete your own account from the admin API.",
      });
    }

    try {
      await new UserRegistry(db).deleteUser(target_uid);
    } catch (e: unknown) {
      if (e instanceof UserNotFoundError) {
        return ctx.json(404, { success: false, message: "User not found" });
      }
      await captureServerException(db, e, {
        op_name: "DELETE_user_handler.deleteUser",
        route: "/api/admin/users/[uid]",
        uid: user.uid,
        context: { target_uid },
      });
      return ctx.json(500, { success: false, message: "Failed to delete user" });
    }

    return ctx.json(200, { success: true, message: "Successfully deleted user", resource_id: target_uid });
  },
});
