import "server-only";
import { toNextRequest } from "@/lib/api/next-request";
import { NextRequest, NextResponse } from "next/server";
import { passwordSchema } from "@schemavaults/auth-common";
import { publicAccess, z, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { authRateLimitedResponse, ValidationIssuesErrorResponse } from "@/lib/api/domain-schemas/authentication";
import { ErrorResponse, SuccessMessageResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
  RESET_PASSWORD_CONFIRM_RATE_LIMIT,
} from "@/lib/rate-limit";
import { withServerTrace } from "@/lib/withServerTrace";
import handleResetPasswordConfirm from "./handle_reset_password_confirm";

const ROUTE = "/api/auth/reset-password/confirm";

export const PasswordResetConfirmRequest = z
  .object({
    token: z.guid().openapi({ description: "The reset token from the e-mailed link (`?token=`)" }),
    new_password: withOpenApi(passwordSchema, { description: "New password (must satisfy the password policy)" }),
  })
  .strict()
  .openapi("PasswordResetConfirmRequest", { description: "Unknown keys are rejected." });

export const confirmPasswordReset = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Reset the password with an e-mailed token",
  description:
    "Consumes a password reset token and sets the new password. Every session and token issued before the reset is invalidated (the user's `tokens_valid_after` watermark moves), so the user has to log in again everywhere. Rate limited per IP.",
  tags: [API_TAGS.authentication],
  auth: publicAccess("The single-use reset token is the credential."),
  request: {
    body: {
      schema: PasswordResetConfirmRequest,
      contentType: "application/json",
      documentOnly: true,
      description: "The body is parsed by the handler itself so its error format stays stable.",
    },
  },
  responses: {
    200: { description: "The password was reset", schema: SuccessMessageResponse },
    400: {
      description:
        "Invalid JSON, a body that fails schema validation (`errors` lists the zod issues), an invalid or expired token, or the client IP could not be determined",
      schema: ValidationIssuesErrorResponse,
    },
    ...authRateLimitedResponse,
    500: { description: "Failed to reset the password", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const { environment } = ctx.context;
    const req: NextRequest =
      ctx.request instanceof NextRequest ? ctx.request : toNextRequest(ctx.request);

    const ip = extractClientIp(req);
    if (!ip) {
      return ipRequiredResponse();
    }

    {
      const result = await checkRateLimit(ctx.context.redis.client, RESET_PASSWORD_CONFIRM_RATE_LIMIT, { ip });
      if (!result.allowed) {
        return rateLimitResponse(result);
      }
    }

    let body_json: unknown;
    try {
      body_json = await req.json();
    } catch (e: unknown) {
      if (environment === "development") {
        console.error(e);
      }
      return NextResponse.json({ success: false, message: "Invalid body JSON" }, { status: 400 });
    }

    try {
      return await withServerTrace({
        op_name: "POST /api/auth/reset-password/confirm",
        op_category: "subroutine",
        event_id: crypto.randomUUID(),
        callback: async () => await handleResetPasswordConfirm({ body: body_json, req }),
      });
    } catch (e: unknown) {
      console.error("Internal server error attempting to handle /api/auth/reset-password/confirm", e);
      return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
  },
});
