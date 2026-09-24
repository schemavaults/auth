import "server-only";
import { toNextRequest } from "@/lib/api/next-request";
import { NextRequest, NextResponse } from "next/server";
import { mfaVerifyBodySchema, type AuthenticateResult } from "@schemavaults/auth-common";
import { publicAccess, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  AuthenticateBadRequest,
  AuthenticatedResult,
  AuthenticateFailureResult,
  authRateLimitedResponse,
  MfaChallengeExpiredResult,
} from "@/lib/api/domain-schemas/authentication";
import { API_TAGS } from "@/lib/api/tags";
import {
  checkRateLimit,
  extractClientIp,
  ipRequiredResponse,
  MFA_VERIFY_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { withServerTrace } from "@/lib/withServerTrace";
import handleMfaVerify from "./handle_mfa_verify";

const ROUTE = "/api/auth/mfa/verify";

export const MfaLoginVerifyRequest = withOpenApi(mfaVerifyBodySchema, "MfaLoginVerifyRequest", {
  description:
    "The `challenge_id` from the `mfa_required` login response, the same `client_app_id` the login was for, and one proof: a 6-digit TOTP code for a factor, a passkey assertion (obtained with the options from `POST /api/auth/mfa/webauthn/options`), or a single-use recovery code.",
});

export const verifyMfaChallenge = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Complete a login MFA challenge",
  description:
    "Second step of a login that answered `mfa_required`: presents a TOTP code, a passkey assertion or a recovery code for the pending challenge. Each wrong proof costs one of the challenge's attempts; when they run out (or the challenge expired) the answer is 410 and the user must log in again. On success the challenge is deleted and the same authorization code + session cookie a password-only login would have produced are issued. Rate limited per IP.",
  tags: [API_TAGS.authentication],
  auth: publicAccess("The challenge id issued by `POST /api/auth/login` is the credential."),
  request: {
    body: {
      schema: MfaLoginVerifyRequest,
      contentType: "application/json",
      documentOnly: true,
      description: "The body is parsed by the handler itself so its error format stays stable.",
    },
  },
  responses: {
    200: { description: "The proof was accepted and the user is authenticated", schema: AuthenticatedResult },
    400: {
      description:
        "Invalid JSON, a body that fails schema validation (raw zod issues), a challenge issued for another client app, or the client IP could not be determined",
      schema: AuthenticateBadRequest,
    },
    401: {
      description: "The proof was wrong; `message` says how many attempts remain",
      schema: AuthenticateFailureResult,
    },
    410: {
      description: "The challenge expired, was already completed, or exhausted its attempts",
      schema: MfaChallengeExpiredResult,
    },
    ...authRateLimitedResponse,
    500: {
      description: "Failed to evaluate the proof or to issue the authorization code",
      schema: AuthenticateFailureResult,
    },
  },
  handler: async (ctx) => {
    const req: NextRequest =
      ctx.request instanceof NextRequest ? ctx.request : toNextRequest(ctx.request);

    const ip = extractClientIp(req);
    if (!ip) return ipRequiredResponse();

    {
      const result = await checkRateLimit(ctx.context.redis.client, MFA_VERIFY_RATE_LIMIT, { ip });
      if (!result.allowed) {
        return rateLimitResponse(result);
      }
    }

    let body_json: unknown;
    try {
      body_json = await req.json();
    } catch {
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
        op_name: "POST /api/auth/mfa/verify",
        op_category: "subroutine",
        event_id: crypto.randomUUID(),
        callback: async () => await handleMfaVerify({ body: body_json, req }),
      });
    } catch (e: unknown) {
      console.error("Internal server error attempting /api/auth/mfa/verify", e);
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
