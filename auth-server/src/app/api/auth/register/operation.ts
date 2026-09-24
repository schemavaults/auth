import "server-only";
import { toNextRequest } from "@/lib/api/next-request";
import { NextRequest, NextResponse } from "next/server";
import type { AuthenticateResult } from "@schemavaults/auth-common";
import { publicAccess, z } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  AuthenticateBadRequest,
  AuthenticatedResult,
  AuthenticateFailureResult,
  authRateLimitedResponse,
  RegisterRequest,
} from "@/lib/api/domain-schemas/authentication";
import { ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  rateLimitResponse,
  REGISTER_RATE_LIMIT,
} from "@/lib/rate-limit";
import { withServerTrace } from "@/lib/withServerTrace";
import handleRegister from "./handle_register";

const ROUTE = "/api/auth/register";

export const register = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Register a new account",
  description:
    "Creates an account for the e-mail address and, like login, starts a PKCE authorization-code grant for `client_app_id` (authorization code + the auth server's HTTP-only session cookie) and sends the verification e-mail. When the `invite_code_required` server setting is on an invite code is mandatory; a supplied code is always validated and consumed. E-mail addresses on the reserved service-account domain are refused. Rate limited per IP.",
  tags: [API_TAGS.authentication],
  auth: publicAccess("Refused while the browser already holds an auth server session."),
  request: {
    body: {
      schema: RegisterRequest,
      contentType: "application/json",
      documentOnly: true,
      description: "The body is parsed by the handler itself so its error format stays stable.",
    },
  },
  responses: {
    200: { description: "The account was created and the user is authenticated", schema: AuthenticatedResult },
    400: {
      description:
        "Invalid JSON, a body that fails schema validation (raw zod issues), a missing / malformed / exhausted invite code, a reserved e-mail domain, a missing or unregistered `redirect_uri`, or the client IP could not be determined",
      schema: AuthenticateBadRequest,
    },
    403: { description: "The browser already holds an auth server session", schema: AuthenticateFailureResult },
    404: { description: "The invite code does not exist", schema: ErrorResponse },
    409: { description: "An account with this e-mail address already exists", schema: AuthenticateFailureResult },
    ...authRateLimitedResponse,
    500: {
      description: "Failed to create the account or to issue the authorization code",
      schema: z.union([AuthenticateFailureResult, ErrorResponse]),
    },
  },
  handler: async (ctx) => {
    const { environment, debug } = ctx.context;
    const req: NextRequest =
      ctx.request instanceof NextRequest ? ctx.request : toNextRequest(ctx.request);

    const ip = extractClientIp(req);
    if (!ip) {
      return ipRequiredResponse();
    }

    {
      const result = await checkRateLimit(ctx.context.redis.client, REGISTER_RATE_LIMIT, { ip });
      if (!result.allowed) {
        return rateLimitResponse(result);
      }
    }

    // Ensure body is valid JSON
    let body_json: unknown;
    try {
      body_json = await req.json();
    } catch (e: unknown) {
      if (environment === "development") {
        console.error(e);
      }
      return NextResponse.json(
        {
          kind: "failure",
          success: false,
          message: "Invalid body JSON",
        } satisfies AuthenticateResult,
        { status: 400 },
      );
    }

    try {
      return await withServerTrace({
        op_name: "POST /api/auth/register",
        op_category: "subroutine",
        event_id: crypto.randomUUID(),
        callback: async () => await handleRegister({ body: body_json, req }, debug),
      });
    } catch (e: unknown) {
      console.error("Internal server error attempting to handle /api/auth/register request", e);
      return NextResponse.json(
        {
          kind: "failure",
          success: false,
          message: "Internal server error",
        } satisfies AuthenticateResult,
        { status: 500 },
      );
    }
  },
});
