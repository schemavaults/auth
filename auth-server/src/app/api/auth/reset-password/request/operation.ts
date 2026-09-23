import "server-only";
import { toNextRequest } from "@/lib/api/next-request";
import { NextRequest, NextResponse } from "next/server";
import { publicAccess, z } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { authRateLimitedResponse } from "@/lib/api/domain-schemas/authentication";
import { ErrorResponse, SuccessMessageResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  checkRateLimit,
  rateLimitResponse,
  RESET_PASSWORD_REQUEST_RATE_LIMIT,
} from "@/lib/rate-limit";
import { withServerTrace } from "@/lib/withServerTrace";
import handleResetPasswordRequest from "./handle_reset_password_request";

const ROUTE = "/api/auth/reset-password/request";

const rateLimitEmailSchema = z.object({ email: z.string() }).passthrough();

export const PasswordResetRequest = z
  .object({
    email: z.email().openapi({ description: "E-mail address of the account", example: "jane@example.com" }),
  })
  .strict()
  .openapi("PasswordResetRequest", { description: "Unknown keys are rejected." });

export const requestPasswordReset = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Request a password reset e-mail",
  description:
    "E-mails a single-use password reset link (valid for one hour) to the address when an account exists for it. The response is the same whether or not the account exists, so addresses cannot be enumerated; service accounts are silently ignored. Rate limited per e-mail address.",
  tags: [API_TAGS.authentication],
  auth: publicAccess(),
  request: {
    body: {
      schema: PasswordResetRequest,
      contentType: "application/json",
      documentOnly: true,
      description: "The body is parsed by the handler itself so its error format stays stable.",
    },
  },
  responses: {
    200: {
      description: "Accepted (whether or not an account exists for the address)",
      schema: SuccessMessageResponse,
    },
    400: { description: "Invalid JSON or a body that fails schema validation", schema: ErrorResponse },
    ...authRateLimitedResponse,
    500: { description: "Unexpected failure", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const { environment } = ctx.context;
    const req: NextRequest =
      ctx.request instanceof NextRequest ? ctx.request : toNextRequest(ctx.request);

    let body_json: unknown;
    try {
      body_json = await req.json();
    } catch (e: unknown) {
      if (environment === "development") {
        console.error(e);
      }
      return NextResponse.json({ success: false, message: "Invalid body JSON" }, { status: 400 });
    }

    const emailParse = rateLimitEmailSchema.safeParse(body_json);
    if (emailParse.success) {
      const result = await checkRateLimit(
        ctx.context.redis.client,
        RESET_PASSWORD_REQUEST_RATE_LIMIT,
        { ip: "", email: emailParse.data.email },
      );
      if (!result.allowed) {
        return rateLimitResponse(result);
      }
    }

    try {
      return await withServerTrace({
        op_name: "POST /api/auth/reset-password/request",
        op_category: "subroutine",
        event_id: crypto.randomUUID(),
        callback: async () => await handleResetPasswordRequest({ body: body_json, req }),
      });
    } catch (e: unknown) {
      console.error("Internal server error attempting to handle /api/auth/reset-password/request", e);
      return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
  },
});
