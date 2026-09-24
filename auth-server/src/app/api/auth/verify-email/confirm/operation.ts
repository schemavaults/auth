import "server-only";
import { toNextRequest } from "@/lib/api/next-request";
import { NextRequest, NextResponse } from "next/server";
import { publicAccess, z } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { authRateLimitedResponse, ValidationIssuesErrorResponse } from "@/lib/api/domain-schemas/authentication";
import { ErrorResponse, SuccessMessageResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
  VERIFY_EMAIL_CONFIRM_RATE_LIMIT,
} from "@/lib/rate-limit";
import { withServerTrace } from "@/lib/withServerTrace";
import handleVerifyEmailConfirm from "./handle_verify_email_confirm";

const ROUTE = "/api/auth/verify-email/confirm";

export const EmailVerificationConfirmRequest = z
  .object({
    token: z.guid().openapi({ description: "The verification token from the e-mailed link (`?token=`)" }),
  })
  .strict()
  .openapi("EmailVerificationConfirmRequest", { description: "Unknown keys are rejected." });

export const confirmEmailVerification = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Confirm an e-mail address with an e-mailed token",
  description:
    "Consumes an e-mail verification token and marks the account's address as verified. Rate limited per IP.",
  tags: [API_TAGS.authentication],
  auth: publicAccess("The single-use verification token is the credential."),
  request: {
    body: {
      schema: EmailVerificationConfirmRequest,
      contentType: "application/json",
      documentOnly: true,
      description: "The body is parsed by the handler itself so its error format stays stable.",
    },
  },
  responses: {
    200: { description: "The address was verified", schema: SuccessMessageResponse },
    400: {
      description:
        "Invalid JSON, a body that fails schema validation (`errors` lists the zod issues), an invalid or expired token, or the client IP could not be determined",
      schema: ValidationIssuesErrorResponse,
    },
    ...authRateLimitedResponse,
    500: { description: "Failed to verify the address", schema: ErrorResponse },
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
      const result = await checkRateLimit(ctx.context.redis.client, VERIFY_EMAIL_CONFIRM_RATE_LIMIT, { ip });
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
        op_name: "POST /api/auth/verify-email/confirm",
        op_category: "subroutine",
        event_id: crypto.randomUUID(),
        callback: async () => await handleVerifyEmailConfirm({ body: body_json, req }),
      });
    } catch (e: unknown) {
      console.error("Internal server error attempting to handle /api/auth/verify-email/confirm", e);
      return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
  },
});
