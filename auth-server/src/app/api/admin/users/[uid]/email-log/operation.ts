import { z, requireAuth } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { AdminUserEmailLogEntry } from "@/lib/api/domain-schemas/admin";
import { adminErrorResponses, ErrorResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { listEmailLogForUser, type UserEmailLogEntry } from "@/lib/auth-db/user-email-log";
import captureServerException from "@/lib/captureServerException";

const ROUTE = "/api/admin/users/{uid}/email-log";
const LEGACY_ROUTE = "/api/admin/users/[uid]/email-log";

export const listUserEmailLog = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "List the verification and password reset e-mails sent to a user",
  description:
    "Lists the most recent 100 attempts to e-mail the user a verification link or a password reset link, newest first, including attempts the mail server did not accept.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params: z.object({ uid: z.guid().openapi({ description: "uid of the target user" }) }),
  },
  responses: {
    200: {
      description: "The user's e-mail log",
      schema: z.object({
        success: z.literal(true),
        message: z.string(),
        data: z.object({ entries: z.array(AdminUserEmailLogEntry).readonly() }),
      }),
    },
    ...validationErrorResponse,
    ...adminErrorResponses,
    500: { description: "Failed to list the e-mail log", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db } = ctx.context;
    const target_uid = ctx.params.uid;

    let entries: readonly UserEmailLogEntry[];
    try {
      entries = await listEmailLogForUser(db, target_uid);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "GET_list_user_email_log_handler.listEmailLogForUser",
        route: LEGACY_ROUTE,
        uid: user.uid,
        context: { target_uid },
      });
      return ctx.json(500, { success: false, message: "Failed to list the user's email log!" });
    }

    return ctx.json(200, {
      success: true,
      message: "Successfully listed the user's email log!",
      data: { entries },
    });
  },
});
