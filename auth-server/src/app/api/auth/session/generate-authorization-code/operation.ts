import "server-only";
import { appIdSchema } from "@schemavaults/app-definitions";
import {
  oidcNonceSchema,
  oidcScopeSchema,
  parseAndGrantScopes,
  serializeOidcScopesOrNull,
} from "@schemavaults/auth-common";
import { codeChallengeSchema } from "@schemavaults/auth-common/pkce/code_challenge.js";
import { isPkceChallengeExpired } from "@schemavaults/auth-common/pkce/is_pkce_challenge_expired.js";
import { requireAuth, z, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { sessionSchemes } from "@/lib/api/auth-schemes";
import { ErrorResponse, sessionErrorResponses, ValidationErrorResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import {
  generateAuthorizationCode,
  type AuthorizationCodeGrantContext,
} from "@/lib/auth-db/users/generate-authorization-code";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import isRedirectUriRegisteredForClientApp from "@/lib/oauth2/validate-redirect-uri";

const ROUTE = "/api/auth/session/generate-authorization-code";

export const GenerateAuthorizationCodeRequest = z
  .object({
    client_app_id: withOpenApi(appIdSchema, {
      description: "Client application the authorization code is issued for",
      example: "my-web-app",
    }),
    code_challenge: withOpenApi(codeChallengeSchema, {
      description: "PKCE `S256` code challenge (RFC 7636) the authorization code is bound to",
    }),
    code_challenge_method: z.literal("S256"),
    challenge_time: z.number().nonnegative().openapi({
      description: "Unix epoch milliseconds when the PKCE verifier was created; expired challenges are refused",
    }),
    redirect_uri: z.url().nullable().optional().openapi({
      description:
        "OAuth2 `redirect_uri` bound to the authorization code. Required for third-party client apps and must be registered for the app; omitted (or null) only when the auth server itself is the requesting app.",
    }),
    nonce: oidcNonceSchema.nullable().optional().openapi({
      description: "OIDC login nonce (OIDC Core §3.1.2.1), echoed in the id_token at redemption. Optional.",
    }),
    scope: oidcScopeSchema.optional().openapi({
      description:
        "Requested scopes, space delimited (RFC 6749 §3.3). The server re-derives the granted subset; absent, or naming no supported scope, is a plain OAuth 2.1 grant without an id_token.",
      example: "openid profile email",
    }),
  })
  .strict()
  .openapi("GenerateAuthorizationCodeRequest", { description: "Unknown keys are rejected." });

export const GenerateAuthorizationCodeResponse = z
  .object({
    success: z.literal(true),
    authorization_code: z.string().openapi({ description: "Redeem at `POST /api/oidc/token` with the PKCE verifier" }),
  })
  .openapi("GenerateAuthorizationCodeResponse");

export const AuthorizationCodeRefusal = z
  .object({
    success: z.literal(false),
    message: z.string(),
    error_id: z.enum(["pkce_challenge_expired", "invalid_redirect_uri"]).optional(),
  })
  .openapi("AuthorizationCodeRefusal", {
    description: "`error_id` identifies the refusal: an expired PKCE challenge or a missing / unregistered `redirect_uri`.",
  });

export const generateAuthorizationCodeOperation = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Issue an authorization code for the current session",
  description:
    "Mints a PKCE authorization code for `client_app_id` on behalf of the signed-in user without re-entering credentials (the OAuth2 authorize bridge and the consent screen use it once the user has authorized the app). The code is bound to the code challenge, the `redirect_uri`, the granted scopes and the nonce exactly as a fresh login would bind them.",
  tags: [API_TAGS.authentication],
  auth: requireAuth({ schemes: sessionSchemes }),
  request: {
    body: { schema: GenerateAuthorizationCodeRequest, lenientContentType: true },
  },
  responses: {
    200: { description: "The authorization code", schema: GenerateAuthorizationCodeResponse },
    400: {
      description:
        "The body failed validation, the PKCE challenge expired, or the `redirect_uri` is missing / not registered for the app",
      schema: z.union([ValidationErrorResponse, AuthorizationCodeRefusal]),
    },
    ...sessionErrorResponses,
    500: { description: "Failed to generate the authorization code", schema: ErrorResponse },
  },
  handler: async (ctx) => {
    const user = ctx.auth.user!;
    const { dbh, environment } = ctx.context;
    const body = ctx.body;

    if (environment === "development") {
      console.log("[/api/auth/session/generate-authorization-code] POST request received");
    }

    if (isPkceChallengeExpired(body.challenge_time)) {
      return ctx.json(400, {
        success: false,
        message: "PKCE challenge has expired",
        error_id: "pkce_challenge_expired",
      });
    }

    // OAuth2 redirect_uri allowlist check. Refuse to mint a code if a
    // redirect_uri was supplied that is not registered for the
    // requesting client app. The auth server's own /account flow
    // legitimately has no redirect_uri to bind, so null is accepted
    // only for the hardcoded auth-server app_id.
    const presentedRedirectUri: string | null = body.redirect_uri ?? null;
    if (presentedRedirectUri !== null) {
      const allowed = await isRedirectUriRegisteredForClientApp({
        redirect_uri: presentedRedirectUri,
        client_app_id: body.client_app_id,
        environment,
        dbh,
      });
      if (!allowed) {
        return ctx.json(400, {
          success: false,
          message: "redirect_uri is not registered for this client_app_id",
          error_id: "invalid_redirect_uri",
        });
      }
    } else if (body.client_app_id !== getAuthServerAppId()) {
      return ctx.json(400, {
        success: false,
        message: "redirect_uri is required for this client_app_id",
        error_id: "invalid_redirect_uri",
      });
    }

    // Granted scopes are re-derived server-side (never trusted
    // verbatim); null when nothing was granted (plain OAuth 2.1 grant).
    const grant_context: AuthorizationCodeGrantContext = {
      nonce: body.nonce ?? null,
      scope: serializeOidcScopesOrNull(parseAndGrantScopes(body.scope).granted),
    };

    try {
      const authorization_code = await generateAuthorizationCode(
        dbh.db,
        user.uid,
        body.client_app_id,
        body.code_challenge,
        body.code_challenge_method,
        body.challenge_time,
        presentedRedirectUri,
        environment === "development",
        grant_context,
      );
      return ctx.json(200, { success: true, authorization_code });
    } catch (e: unknown) {
      console.error("[generate-authorization-code] Failed to generate authorization code:", e);
      return ctx.json(500, { success: false, message: "Failed to generate authorization code" });
    }
  },
});
