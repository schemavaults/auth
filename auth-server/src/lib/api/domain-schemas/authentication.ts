import { appIdSchema } from "@schemavaults/app-definitions";
import {
  authenticatedAuthenticateResultSchema,
  authenticateFailureResultSchema,
  challengeExpiredAuthenticateResultSchema,
  mfaRequiredAuthenticateResultSchema,
  oidcNonceSchema,
  oidcScopeSchema,
  passwordSchema,
  PKCE_ProofKeyManager,
} from "@schemavaults/auth-common";
import { z, withOpenApi } from "@schemavaults/openapi-operations";
import { ErrorResponse, RateLimitedResponse } from "@/lib/api/schemas";

/**
 * Schemas shared by the "authentication" operations (`/api/auth/*`): the
 * `AuthenticateResult` wire format of login / registration / the MFA
 * challenge (parsed strictly by the client SDK with
 * `authenticateResultSchema`), the PKCE grant request fields those
 * endpoints share, and the bespoke error envelopes they return.
 */

export const AuthenticatedResult = withOpenApi(authenticatedAuthenticateResultSchema, "AuthenticatedResult", {
  description:
    "The user is authenticated: redeem `authorization_code` at `POST /api/oidc/token` (PKCE). The response also sets the auth server's HTTP-only session cookie.",
});

export const MfaRequiredResult = withOpenApi(mfaRequiredAuthenticateResultSchema, "MfaRequiredResult", {
  description:
    "The password was accepted but the account has a verified second factor: complete the challenge at `POST /api/auth/mfa/verify` before `expires_at` (Unix epoch milliseconds). No session or authorization code is issued yet.",
});

export const AuthenticateFailureResult = withOpenApi(authenticateFailureResultSchema, "AuthenticateFailureResult", {
  description: "The request was refused; `message` explains why.",
});

export const MfaChallengeExpiredResult = withOpenApi(challengeExpiredAuthenticateResultSchema, 
  "MfaChallengeExpiredResult",
  {
    description:
      "The MFA challenge no longer exists (expired, exhausted its attempts, or already completed): the user has to log in again.",
  },
);

/** What a successful `POST /api/auth/login` answers. */
export const AuthenticateSuccessResult = z
  .union([AuthenticatedResult, MfaRequiredResult])
  .openapi("AuthenticateSuccessResult", {
    description: "Discriminated on `kind`: `authenticated` or `mfa_required`.",
  });

/**
 * The serialized zod error these endpoints answer with when the body does
 * not match their schema (`NextResponse.json(parseResult.error)`).
 */
export const ZodIssuesResponse = z
  .object({
    issues: z.array(
      z
        .object({
          code: z.string(),
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
  .openapi("ZodIssuesResponse", {
    description: "A serialized zod error: the request body did not match the endpoint's schema.",
  });

/**
 * The 400 bodies of login / registration / the MFA challenge: a failure
 * result, raw zod issues, or the plain error envelope (client IP unknown).
 * One flat union: zod-to-openapi flattens nested unions, which would drop
 * this component's reference if it were nested in another union.
 */
export const AuthenticateBadRequest = z
  .union([AuthenticateFailureResult, ZodIssuesResponse, ErrorResponse])
  .openapi("AuthenticateBadRequest", {
    description:
      "An `AuthenticateFailureResult` (invalid JSON, `redirect_uri` problems, invite code problems, ...), the raw zod issues of a body that failed schema validation, or the plain `{ success: false, message }` envelope when the client IP could not be determined.",
  });

/** `{ success: false, message, errors? }` of the token-confirming endpoints. */
export const ValidationIssuesErrorResponse = z
  .object({
    success: z.literal(false),
    message: z.string(),
    errors: z
      .array(z.unknown())
      .optional()
      .openapi({ description: "zod issues, present when the body failed schema validation" }),
  })
  .openapi("ValidationIssuesErrorResponse");

export const LoginCredentials = z
  .object({
    email: z.email().openapi({
      description: "Account e-mail address; trimmed and lower-cased before lookup",
      example: "jane@example.com",
    }),
    password: withOpenApi(passwordSchema, { description: "Account password (must satisfy the password policy)" }),
  })
  .strict()
  .openapi("LoginCredentials");

/** The PKCE authorization-code grant fields shared by login and registration. */
const pkceGrantRequestFields = {
  client_app_id: withOpenApi(appIdSchema, {
    description: "Client application the authorization code is issued for",
    example: "my-web-app",
  }),
  code_challenge: withOpenApi(PKCE_ProofKeyManager.codeChallengeSchema, {
    description: "PKCE `S256` code challenge (RFC 7636) the authorization code is bound to",
  }),
  challenge_time: z.number().nonnegative().openapi({
    description: "Unix epoch milliseconds when the PKCE verifier was created; stale challenges are refused at redemption",
  }),
  redirect_uri: z.url().nullable().optional().openapi({
    description:
      "OAuth2 `redirect_uri` bound to the authorization code. Required for third-party client apps and must be registered for the app; omitted (or null) only for the auth server's own `/account` flow.",
  }),
  nonce: oidcNonceSchema.nullable().optional().openapi({
    description:
      "OIDC login nonce (OIDC Core §3.1.2.1), echoed in the id_token at redemption. Optional.",
  }),
  scope: oidcScopeSchema.optional().openapi({
    description:
      "Requested scopes, space delimited (RFC 6749 §3.3). The server re-derives the granted subset; absent, or naming no supported scope, is a plain OAuth 2.1 grant without an id_token.",
    example: "openid profile email",
  }),
};

export const LoginRequest = z
  .object({ credentials: LoginCredentials, ...pkceGrantRequestFields })
  .strict()
  .openapi("LoginRequest", { description: "Unknown keys are rejected." });

export const RegisterRequest = z
  .object({
    credentials: LoginCredentials,
    invite_code: z.string().min(8).optional().openapi({
      description:
        "Invite code. Required when the `invite_code_required` server setting is on; the superuser invite code creates the first administrator.",
    }),
    ...pkceGrantRequestFields,
  })
  .strict()
  .openapi("RegisterRequest", { description: "Unknown keys are rejected." });

/** The 429 every rate-limited authentication endpoint can answer with. */
export const authRateLimitedResponse = {
  429: {
    description: "Too many requests; `Retry-After` and `X-RateLimit-*` headers say when to retry",
    schema: RateLimitedResponse,
  },
} as const;
