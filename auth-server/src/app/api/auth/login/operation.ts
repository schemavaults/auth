import "server-only";
import { toNextRequest } from "@/lib/api/next-request";
import { NextRequest, NextResponse } from "next/server";
import type { AuthenticateResult } from "@schemavaults/auth-common";
import { publicAccess, z } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  AuthenticateBadRequest,
  AuthenticateFailureResult,
  AuthenticateSuccessResult,
  authRateLimitedResponse,
  LoginRequest,
} from "@/lib/api/domain-schemas/authentication";
import { ErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  checkRateLimit,
  checkRateLimitCount,
  extractClientIp,
  incrementRateLimitCounter,
  ipRequiredResponse,
  LOGIN_LOCKOUT,
  LOGIN_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { withServerTrace } from "@/lib/withServerTrace";
import handleLogin from "./handle_login";

const ROUTE = "/api/auth/login";

const rateLimitEmailSchema = z
  .object({
    credentials: z.object({ email: z.string() }).passthrough(),
  })
  .passthrough();

export const login = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Log in with email and password",
  description:
    "Verifies the credentials and starts a PKCE authorization-code grant for `client_app_id`: on success the authorization code is bound to the code challenge, the `redirect_uri`, the granted scopes and the nonce, and the auth server's HTTP-only session cookie is set. Accounts with a verified second factor get an `mfa_required` challenge instead (complete it at `POST /api/auth/mfa/verify`). Wrong credentials and unknown accounts answer the same 401. Rate limited per IP + e-mail (a sliding window plus a lockout counter of failed attempts).",
  tags: [API_TAGS.authentication],
  auth: publicAccess(
    "Credentials travel in the body. An existing auth server session cookie is only used to refuse signing in as a different user.",
  ),
  request: {
    body: {
      schema: LoginRequest,
      contentType: "application/json",
      documentOnly: true,
      description: "The body is parsed by the handler itself so its error format stays stable.",
    },
  },
  responses: {
    200: {
      description: "Authenticated (authorization code issued) or an MFA challenge was created",
      schema: AuthenticateSuccessResult,
    },
    400: {
      description:
        "Invalid JSON, a body that fails schema validation (raw zod issues), a missing or unregistered `redirect_uri`, or the client IP could not be determined",
      schema: AuthenticateBadRequest,
    },
    401: {
      description: "Invalid email or password (constant body, so accounts cannot be enumerated)",
      schema: AuthenticateFailureResult,
    },
    403: {
      description: "The account is disabled, or the browser already holds another user's session",
      schema: AuthenticateFailureResult,
    },
    ...authRateLimitedResponse,
    500: {
      description: "Failed to verify the credentials or to issue the authorization code",
      schema: z.union([AuthenticateFailureResult, ErrorResponse]),
    },
  },
  handler: async (ctx) => {
    const { environment } = ctx.context;
    const req: NextRequest =
      ctx.request instanceof NextRequest ? ctx.request : toNextRequest(ctx.request);

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

    const ip = extractClientIp(req);
    if (!ip) {
      return ipRequiredResponse();
    }

    const emailParse = rateLimitEmailSchema.safeParse(body_json);
    const email: string | undefined = emailParse.success
      ? emailParse.data.credentials.email
      : undefined;

    if (email) {
      const redis = ctx.context.redis.client;
      const identifiers = { ip, email };

      const lockout = await checkRateLimitCount(redis, LOGIN_LOCKOUT, identifiers);
      if (!lockout.allowed) {
        return rateLimitResponse(lockout);
      }

      const windowCheck = await checkRateLimit(redis, LOGIN_RATE_LIMIT, identifiers);
      if (!windowCheck.allowed) {
        return rateLimitResponse(windowCheck);
      }
    }

    try {
      const response = await withServerTrace({
        op_name: "POST /api/auth/login",
        op_category: "subroutine",
        event_id: crypto.randomUUID(),
        callback: async () => await handleLogin({ body: body_json, req }),
      });

      // Both the "no such user" and "wrong password" branches in handleLogin
      // return 401 with a constant body, so a single 401 check covers both
      // negative cases for the lockout-counter increment.
      if (email && response.status === 401) {
        await incrementRateLimitCounter(ctx.context.redis.client, LOGIN_LOCKOUT, { ip, email });
      }

      return response;
    } catch (e: unknown) {
      console.error("Internal server error attempting to handle /api/auth/login request", e);
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
