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
import { UserRegistry, type UserDocument } from "@/lib/auth-db";
import captureServerException from "@/lib/captureServerException";
import sendVerificationEmail from "@/lib/mail/send-verification-email";

const ROUTE = "/api/admin/users/{uid}/resend-verification";
const LEGACY_ROUTE = "/api/admin/users/[uid]/resend-verification";

export const resendUserVerificationEmail = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Resend a user's verification e-mail",
  description: "Issues a fresh e-mail verification token for the user and e-mails the verification link to them.",
  tags: [API_TAGS.admin],
  auth: requireAuth({ schemes: sessionSchemes, routeGuard: "admin" }),
  request: {
    params: z.object({ uid: z.guid().openapi({ description: "uid of the target user" }) }),
  },
  responses: {
    200: { description: "The verification e-mail was sent", schema: ResourceCreationResponse },
    ...validationErrorResponse,
    ...adminErrorResponses,
    404: { description: "No such user", schema: ErrorResponse },
    409: { description: "The user's e-mail address is already verified", schema: ErrorResponse },
    500: { description: "Failed to load the user or send the e-mail", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user;
    const { db, redis } = ctx.context;
    const target_uid = ctx.params.uid;
    const registry = new UserRegistry(db);

    let targetUser: UserDocument | null;
    try {
      targetUser = await registry.getUserByUID(target_uid);
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_resend_verification_handler.getUserByUID",
        route: LEGACY_ROUTE,
        uid: user.uid,
        context: { target_uid },
      });
      return ctx.json(500, { success: false, message: "Failed to load target user" });
    }

    if (!targetUser) return ctx.json(404, { success: false, message: "User not found" });
    if (targetUser.email_verified) {
      return ctx.json(409, { success: false, message: "User's email is already verified" });
    }

    try {
      const rawToken: string = await registry.createEmailVerificationToken(targetUser.uid);
      await sendVerificationEmail({ email: targetUser.email, rawToken, db, redis });
    } catch (e: unknown) {
      await captureServerException(db, e, {
        op_name: "POST_resend_verification_handler.sendVerificationEmail",
        route: LEGACY_ROUTE,
        uid: user.uid,
        context: { target_uid },
      });
      return ctx.json(500, { success: false, message: "Failed to send verification email" });
    }

    return ctx.json(200, { success: true, message: "Verification email sent", resource_id: target_uid });
  },
});
