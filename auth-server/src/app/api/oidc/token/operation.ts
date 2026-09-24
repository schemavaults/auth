import { toNextRequest } from "@/lib/api/next-request";
import { appIdSchema } from "@schemavaults/app-definitions";
import { oidcRefreshTokenDeliveryModeSchema } from "@schemavaults/auth-common";
import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  OAUTH_FORM_CONTENT_TYPE,
  OAuthErrorResponse,
  noStoreHeaders,
  wwwAuthenticateHeaders,
} from "@/lib/api/domain-schemas/oidc";
import { ErrorResponse, RateLimitedResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { handleOidcTokenRequest } from "./token-request";

const ROUTE = "/api/oidc/token";

export const OidcTokenRequest = z
  .object({
    grant_type: z.enum(["authorization_code", "refresh_token", "client_credentials"]).openapi({
      description: "Which grant to redeem.",
    }),
    client_id: appIdSchema.optional().openapi({
      description:
        "The client application id. May be omitted when the client authenticates with `client_secret_basic` (the id then comes from the `Authorization` header).",
      example: "my-web-app",
    }),
    client_secret: z.string().optional().openapi({
      description: "`client_secret_post` authentication for confidential clients (apps with a registered client secret).",
    }),
    code: z.string().optional().openapi({ description: "`authorization_code`: the code from the authorization response." }),
    redirect_uri: z.string().optional().openapi({
      description: "`authorization_code`: must equal the `redirect_uri` of the authorization request.",
    }),
    code_verifier: z.string().optional().openapi({ description: "`authorization_code`: the PKCE code verifier (RFC 7636)." }),
    refresh_token: z.string().optional().openapi({
      description:
        "`refresh_token`: the refresh token to rotate. Browser SDK clients that chose cookie delivery send it as the `refresh_token_<client_id>` cookie instead.",
    }),
    scope: z.string().optional().openapi({
      description: "`refresh_token` / `client_credentials`: requested scope, which may only narrow the originally granted scope.",
    }),
    resource: z.string().optional().openapi({
      description:
        "RFC 8707 resource indicator, as extended by @schemavaults/auth-server: the URL of a registered API server; the `access_token` is then minted for that audience instead of the reserved userinfo audience. At most one per request.",
      example: "https://api.example.com",
    }),
    refresh_token_delivery: oidcRefreshTokenDeliveryModeSchema.optional().openapi({
      description:
        "@schemavaults/auth-server extension: `http_only_cookie` sets the refresh token as the HTTP-only `refresh_token_<client_id>` cookie (plus a JS-readable expiry marker) and omits `refresh_token` from the body. Default `inline`.",
    }),
  })
  .openapi("OidcTokenRequest");

export const OidcTokenResponse = z
  .object({
    access_token: z.string().openapi({ description: "Encrypted (JWE) access token; opaque to the client." }),
    token_type: z.literal("Bearer"),
    expires_in: z.number().int().openapi({ description: "Access token lifetime in seconds." }),
    refresh_token: z.string().optional().openapi({
      description: "Omitted for `client_credentials` and when `refresh_token_delivery=http_only_cookie`.",
    }),
    refresh_token_expires_in: z.number().int().optional().openapi({
      description: "@schemavaults/auth-server extension: seconds until the (possibly cookie-delivered) refresh token expires.",
    }),
    scope: z.string().optional().openapi({ description: "Granted scope; omitted when nothing was granted (plain OAuth 2.1 grant)." }),
    id_token: z.string().optional().openapi({
      description: "RS256-signed id_token; only on an `authorization_code` grant whose scope includes `openid`.",
    }),
  })
  .loose()
  .openapi("OidcTokenResponse");

export const postOidcToken = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Token endpoint",
  description:
    "The OAuth 2.0 / OIDC token endpoint (RFC 6749 §3.2, form-encoded). Three grants: `authorization_code` (PKCE `code_verifier` required, `redirect_uri` must match; mints an id_token when the grant's scope includes `openid`), `refresh_token` (rotates the refresh token; the previous one is revoked), and `client_credentials` (confidential clients only; mints a machine-to-machine access token for the app's service account, no refresh token). " +
    "@schemavaults/auth-server extensions: the RFC 8707 `resource` parameter mints the access token for a registered API server, and `refresh_token_delivery=http_only_cookie` delivers the refresh token as an HTTP-only cookie (`Set-Cookie`) instead of in the body; every response with a refresh token carries `refresh_token_expires_in`. " +
    "Browser callers (with an `Origin` header) must come from one of the client app's registered origins and then receive a credentialed CORS allowance; other callers get `Access-Control-Allow-Origin: *`. `refresh_token` and `client_credentials` requests are rate limited per IP. Responses carry `Cache-Control: no-store`.",
  tags: [API_TAGS.oidc],
  auth: publicAccess(
    "Client authentication per RFC 6749 §2.3: public clients send `client_id` only (PKCE is the security boundary); confidential clients (apps with a registered client secret) must authenticate with `client_secret_basic` (HTTP Basic `Authorization` header) or `client_secret_post` (`client_secret` form field). The handler performs this itself.",
  ),
  request: {
    body: {
      contentType: OAUTH_FORM_CONTENT_TYPE,
      schema: OidcTokenRequest,
      documentOnly: true,
      description: "Form-encoded token request. Which fields are required depends on `grant_type`.",
    },
  },
  responses: {
    200: {
      description: "The token response (RFC 6749 §5.1 / OIDC Core §3.1.3.3)",
      schema: OidcTokenResponse,
      headers: noStoreHeaders.extend({
        "Set-Cookie": z.string().optional().openapi({
          description: "Refresh token cookies when `refresh_token_delivery=http_only_cookie` was requested.",
        }),
      }),
    },
    400: {
      description:
        "OAuth error (`invalid_request`, `unsupported_grant_type`, `invalid_grant`, `invalid_scope`, `invalid_target`, `unauthorized_client`, ...), or the client IP could not be determined for rate limiting (`{ success: false, message }`).",
      schema: z.union([OAuthErrorResponse, ErrorResponse]),
    },
    401: {
      description: "Client authentication failed (`invalid_client`)",
      schema: OAuthErrorResponse,
      headers: wwwAuthenticateHeaders,
    },
    403: {
      description: "The request came from an origin the client application has not registered (`invalid_request`)",
      schema: OAuthErrorResponse,
    },
    429: { description: "Rate limited (`refresh_token` / `client_credentials` grants)", schema: RateLimitedResponse },
    500: { description: "The token request could not be processed", schema: OAuthErrorResponse },
  },
  handler: (ctx) => handleOidcTokenRequest(toNextRequest(ctx.request)),
});
