import "server-only";
import { toNextRequest } from "@/lib/api/next-request";
import { NextRequest, NextResponse } from "next/server";
import { publicAccess, z } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { ErrorResponse, SuccessMessageResponse, validationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { withServerTrace } from "@/lib/withServerTrace";
import handleVerifyEmailRequest from "./handle_verify_email_request";

const ROUTE = "/api/auth/verify-email/request";

export const EmailVerificationRequest = z
  .object({
    email: z.email().openapi({ description: "E-mail address of the account", example: "jane@example.com" }),
  })
  .strict()
  .openapi("EmailVerificationRequest", { description: "Unknown keys are rejected." });

export const requestEmailVerification = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Request a verification e-mail",
  description:
    "Sends a fresh verification link to the address when an unverified account exists for it. The response is the same whether the account exists, is already verified, or not, so addresses cannot be enumerated.",
  tags: [API_TAGS.authentication],
  auth: publicAccess(),
  request: {
    body: { schema: EmailVerificationRequest, lenientContentType: true },
  },
  responses: {
    200: {
      description: "Accepted (whether or not an unverified account exists for the address)",
      schema: SuccessMessageResponse,
    },
    ...validationErrorResponse,
    500: { description: "Unexpected failure", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const req: NextRequest =
      ctx.request instanceof NextRequest ? ctx.request : toNextRequest(ctx.request);
    try {
      return await withServerTrace({
        op_name: "POST /api/auth/verify-email/request",
        op_category: "subroutine",
        event_id: crypto.randomUUID(),
        callback: async () => await handleVerifyEmailRequest({ body: ctx.body, req }),
      });
    } catch (e: unknown) {
      console.error("Internal server error attempting to handle /api/auth/verify-email/request", e);
      return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
  },
});
