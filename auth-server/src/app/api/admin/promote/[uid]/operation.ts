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
import { UserRegistry } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/promote/{uid}";

export const promoteUserToAdmin = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Promote a user to administrator",
  description: "Grants the platform administrator flag to the user with the given uid.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params: z.object({ uid: z.guid().openapi({ description: "uid of the user to promote" }) }),
  },
  responses: {
    200: { description: "The user is now an administrator", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...adminErrorResponses,
    404: { description: "No such user", schema: ErrorResponse },
    500: { description: "Failed to promote the user", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const new_superuser_uid = ctx.params.uid;

    // Promote user with user ID 'new_superuser_uid' to superuser/admin
    try {
      await new UserRegistry(db).promoteToAdmin(new_superuser_uid);
    } catch (e: unknown) {
      if (e instanceof Error && (e.message.includes("not found") || e.message.includes("does not exist"))) {
        return ctx.json(404, { success: false, message: "User not found" });
      }
      await captureServerException(db, e, {
        op_name: "POST_admin_promotion_handler.promoteToAdmin",
        route: "/api/admin/promote/[uid]",
        uid: user.uid,
        context: { target_uid: new_superuser_uid },
      });
      return ctx.json(500, { success: false, message: "Failed to set user as superuser" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully promoted user to admin",
      resource_id: new_superuser_uid,
    });
  },
});
