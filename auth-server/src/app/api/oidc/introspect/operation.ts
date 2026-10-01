import { toNextRequest } from "@/lib/api/next-request";
import { apiServerIdSchema, appIdSchema } from "@schemavaults/app-definitions";
import { OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE } from "@schemavaults/auth-common";
import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  OAUTH_FORM_CONTENT_TYPE,
  OAuthErrorResponse,
  noStoreHeaders,
  wwwAuthenticateHeaders,
} from "@/lib/api/domain-schemas/oidc";
import { API_TAGS } from "@/lib/api/tags";
import { handleOidcIntrospectRequest } from "./introspect-handler";

const ROUTE = "/api/oidc/introspect";

export const OidcIntrospectionRequest = z
  .object({
    token: z.string().openapi({ description: "REQUIRED. The access or refresh token to introspect." }),
    token_type_hint: z.enum(["access_token", "refresh_token"]).optional().openapi({
      description: "Accepted but unused: the token kind is read from the token itself.",
    }),
    client_id: z.union([appIdSchema, apiServerIdSchema]).optional().openapi({
      description:
        "The confidential client's app id (may be omitted with `client_secret_basic`), or the API server id with `private_key_jwt` (optional; must equal the assertion's `iss`).",
    }),
    client_secret: z.string().optional().openapi({ description: "`client_secret_post` authentication." }),
    client_assertion_type: z.literal(OAUTH_JWT_BEARER_CLIENT_ASSERTION_TYPE).optional().openapi({
      description: "`private_key_jwt` authentication (RFC 7523 §2.2), for API servers.",
    }),
    client_assertion: z.string().optional().openapi({
      description:
        "`private_key_jwt`: a JWKS access assertion signed with the API server's JWKS access key (`createJwksAccessProofToken()` from `@schemavaults/jwt`; `iss` = `sub` = the API server id, `aud` = the issuer, single-use `jti`).",
    }),
  })
  .openapi("OidcIntrospectionRequest");

export const OidcIntrospectionResponse = z
  .union([
    z.object({ active: z.literal(false) }),
    z
      .object({
        active: z.literal(true),
        scope: z.string().optional().openapi({
          description: "Space-delimited granted scope; absent for tokens from a plain OAuth 2.1 grant.",
        }),
        client_id: z.string().openapi({ description: "The client application the token was issued to." }),
        username: z.string().optional().openapi({ description: "The resource owner's email; only when the `email` scope was granted." }),
        token_type: z.literal("Bearer").optional().openapi({ description: "Present for access tokens only." }),
        exp: z.number().int().openapi({ description: "Expiry, seconds since the Unix epoch." }),
        iat: z.number().int().openapi({ description: "Issued at, seconds since the Unix epoch." }),
        sub: z.string().openapi({ description: "Subject in the `<auth_server_app_id>|<uid>` form." }),
        uid: z.guid().openapi({ description: "The platform user id (the `<uid>` part of `sub`)." }),
        aud: z.string(),
        iss: z.string(),
        jti: z.string().optional(),
      })
      .loose(),
  ])
  .openapi("OidcIntrospectionResponse", { description: "RFC 7662 §2.2 introspection response." });

export const postOidcIntrospect = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Token introspection",
  description:
    "The OAuth 2.0 token introspection endpoint (RFC 7662), advertised as `introspection_endpoint`. The caller POSTs a token issued by this server and learns whether it is currently active plus its metadata (scope, client, subject, expiry). Two kinds of caller may introspect, each only its own tokens: " +
    "a confidential client app, the OIDC surface's access and refresh tokens issued to it; and an API server (`private_key_jwt` with its JWKS access key), the access tokens minted for it (its id or one of its RFC 8707 resource URLs as `aud`), so it can learn about logouts, password resets, disabled accounts and de-authorized apps that local token verification cannot see. " +
    "Tokens the caller may not see (another client's or another API server's), tokens of a client app the user has since de-authorized or (for API servers) that is no longer connected to the API server, expired and revoked tokens all yield `{ \"active\": false }`. " +
    "Public (PKCE-only) clients cannot introspect: without client authentication the endpoint would be open to token scanning. Responses carry `Cache-Control: no-store` and `Access-Control-Allow-Origin: *`.",
  tags: [API_TAGS.oidc],
  auth: publicAccess(
    "Client authentication is REQUIRED (RFC 7662 §2.1): `client_secret_basic` (HTTP Basic `Authorization` header) or `client_secret_post` (`client_secret` form field) of an app with a registered client secret, or `private_key_jwt` (`client_assertion_type` + `client_assertion` form fields) of an API server with an active JWKS access key. The handler performs this itself; `none` is not accepted.",
  ),
  request: {
    body: {
      contentType: OAUTH_FORM_CONTENT_TYPE,
      schema: OidcIntrospectionRequest,
      documentOnly: true,
    },
  },
  responses: {
    200: { description: "The token's state", schema: OidcIntrospectionResponse, headers: noStoreHeaders },
    400: {
      description:
        "Not form-encoded, `token` missing, malformed `client_id`, a malformed Basic `Authorization` header, more than one client authentication method, or an unsupported `client_assertion_type` / missing `client_assertion` (`invalid_request`)",
      schema: OAuthErrorResponse,
    },
    401: {
      description:
        "No client identified, the client secret is wrong, the client is not confidential, or the client assertion does not verify against the API server's active JWKS access key (`invalid_client`)",
      schema: OAuthErrorResponse,
      headers: wwwAuthenticateHeaders,
    },
    500: { description: "The introspection request could not be processed (`server_error`)", schema: OAuthErrorResponse },
  },
  handler: (ctx) => handleOidcIntrospectRequest(toNextRequest(ctx.request)),
});
