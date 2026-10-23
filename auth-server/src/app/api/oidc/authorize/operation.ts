import { NextResponse } from "next/server";
import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { OAuthErrorResponse, noStoreHeaders } from "@/lib/api/domain-schemas/oidc";
import { API_TAGS } from "@/lib/api/tags";
import { getAuthServerUri } from "@/lib/auth_server_uri";
import validateOidcAuthorizeRequest from "@/lib/oidc/validate-authorize-request";
import answerSilentAuthorizeRequest from "@/lib/oidc/answer-silent-authorize-request";
import { toNextRequest } from "@/lib/api/next-request";

const ROUTE = "/api/oidc/authorize";

/**
 * A documented authorization request parameter. The handler validates the
 * parameters itself (RFC 6749 §4.1.2.1 prescribes a direct 400 for a bad
 * `client_id` / `redirect_uri` and an error REDIRECT for everything else),
 * so the runtime must never reject the query: every field is optional and
 * a value the schema cannot represent (e.g. a repeated key) is dropped
 * instead of failing validation.
 */
function authorizeParam(description: string, example?: string) {
  return z
    .string()
    .optional()
    .catch(undefined)
    .openapi({ type: "string", description, ...(example === undefined ? {} : { example }) });
}

export const OidcAuthorizeQuery = z
  .object({
    client_id: authorizeParam("REQUIRED. The client application id.", "my-web-app"),
    redirect_uri: authorizeParam(
      "REQUIRED. Must exactly match a callback URL registered for the client app (http loopback URLs are port-agnostic per RFC 8252 §7.3).",
      "https://app.example.com/auth/callback",
    ),
    response_type: authorizeParam("REQUIRED. Only `code` is supported.", "code"),
    scope: authorizeParam(
      "OPTIONAL. Space-delimited scopes. With `openid` this is an OpenID Connect authentication request (an id_token is minted); without it a plain OAuth 2.1 authorization grant (access + refresh tokens only). Supported: `openid`, `email`, `profile`, plus the API scopes defined by the API server named in `resource`; unknown scopes are ignored.",
      "openid email profile",
    ),
    state: authorizeParam("RECOMMENDED. Opaque value echoed back on the redirect (also on error redirects)."),
    nonce: authorizeParam("OPTIONAL. Bound to the id_token's `nonce` claim (OIDC Core §3.1.2.1)."),
    code_challenge: authorizeParam("REQUIRED. PKCE code challenge (RFC 7636); every client is treated as public."),
    code_challenge_method: authorizeParam("REQUIRED. Only `S256` is supported.", "S256"),
    prompt: authorizeParam(
      "OPTIONAL. Space-delimited. `none` (alone): no UI — when the user agent has a signed-in session, the account may be handed to the app and the user already consented to everything requested, the endpoint redirects back with a code; otherwise with `login_required`, `interaction_required` (e-mail verification pending) or `consent_required`. `consent`: the consent screen is shown even if nothing new is requested. Other values are ignored.",
    ),
    request: authorizeParam("Not supported: refused with `request_not_supported` (no JAR / RFC 9101)."),
    request_uri: authorizeParam("Not supported: refused with `request_uri_not_supported`."),
    resource: authorizeParam(
      "OPTIONAL. RFC 8707 resource indicator: an API server id, or the https URL of one of its registered domains, that this client may get tokens for. The requested `scope` values that API server defines (its API scopes, e.g. `notes:read`) are granted: the access tokens minted for that API server (send the same `resource` to the token endpoint) carry them, and the refresh token keeps them. A value that names no such API server, or several `resource` values, is ignored (only OIDC scopes are granted); the token endpoint refuses an unusable `resource` with `invalid_target`.",
      "https://api.example.com/mcp",
    ),
  })
  .loose();

export const oidcAuthorize = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "Authorization endpoint",
  description:
    "The OAuth 2.0 / OpenID Connect authorization endpoint (RFC 6749 §3.1, OIDC Core §3.1.2). Validates the request and redirects the user-agent to the auth server's login / consent UI, which later redirects back to `redirect_uri` with `code`, `state` and `iss` (RFC 9207). PKCE `S256` is mandatory. " +
    "Errors in `client_id` or `redirect_uri` are answered with a direct 400 (never a redirect); every later failure (`unsupported_response_type`, `invalid_scope`, `invalid_request`, `login_required`, `consent_required`, `interaction_required`, `request_not_supported`, ...) redirects back to the validated `redirect_uri` with `error`, `error_description`, `state` and `iss` query parameters. Responses carry `Cache-Control: no-store`.",
  tags: [API_TAGS.oidc],
  auth: publicAccess(
    "No credentials: the resource owner authenticates on the login page this endpoint redirects to. The client is identified by `client_id` and its registered `redirect_uri`.",
  ),
  request: { query: OidcAuthorizeQuery },
  responses: {
    302: {
      description:
        "Redirect. On success `Location` is the auth server's login page carrying the bridged parameters (`app_id`, `code_challenge`, `code_challenge_method`, `challenge_time`, `redirect_uri`, `state`, `nonce`, `scope`, `resource` when the request asks for API scopes of it, and `prompt=consent`); with `prompt=none` it is the client's `redirect_uri` with `code`, `state` and `iss` directly; on a post-validation error it is the client's `redirect_uri` with `error`, `error_description`, `state` and `iss`.",
      headers: noStoreHeaders.extend({
        Location: z.string().openapi({ description: "Where the user-agent is sent next." }),
      }),
    },
    400: {
      description:
        "`client_id` is missing, malformed, unknown or not registered for web redirect flows (`invalid_request` / `unauthorized_client`), `redirect_uri` is missing, invalid or unregistered, `state` is malformed, or the client app could not be loaded (`server_error`).",
      schema: OAuthErrorResponse,
      headers: noStoreHeaders,
    },
  },
  handler: async (ctx) => {
    const { dbh, environment, debug } = ctx.context;

    const validation = await validateOidcAuthorizeRequest(ctx.url.searchParams, dbh);
    if (validation.kind === "response") {
      return validation.response;
    }
    if (validation.request.prompt_none) {
      return await answerSilentAuthorizeRequest({
        request: toNextRequest(ctx.request),
        dbh,
        validated: validation.request,
        environment,
        debug,
      });
    }
    const { client_app_id, redirect_uri, scope, resource, state, nonce, code_challenge } =
      validation.request;

    // Bridge into the platform's existing login/consent/MFA UI. `scope` /
    // `nonce` are first-class on every flow; a plain OAuth 2.1 grant (no
    // `openid`) bridges with NO `scope` parameter so the login flow binds a
    // null scope and the token endpoint mints no id_token for the code.
    // `challenge_time` is an SDK-internal timestamp standard RPs don't send;
    // it is synthesized here (it does not enter the PKCE hash — it only
    // anchors the challenge-expiry window).
    const bridge = new URL("/auth/login", getAuthServerUri());
    bridge.searchParams.set("app_id", client_app_id);
    bridge.searchParams.set("code_challenge", code_challenge);
    bridge.searchParams.set("code_challenge_method", "S256");
    bridge.searchParams.set("challenge_time", `${Date.now()}`);
    bridge.searchParams.set("redirect_uri", redirect_uri);
    if (state) {
      bridge.searchParams.set("state", state);
    }
    if (nonce) {
      bridge.searchParams.set("nonce", nonce);
    }
    if (scope.length > 0) {
      bridge.searchParams.set("scope", scope);
    }
    // The resource travels with the flow only when the scope holds its API
    // scopes: the login flow binds them to the code for that API server.
    if (resource) {
      bridge.searchParams.set("resource", resource);
    }
    if (validation.request.prompt_consent) {
      bridge.searchParams.set("prompt", "consent");
    }

    return NextResponse.redirect(bridge, {
      status: 302,
      headers: { "Cache-Control": "no-store" },
    });
  },
});
