import { toNextRequest } from "@/lib/api/next-request";
import { appIdSchema } from "@schemavaults/app-definitions";
import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import {
  OAUTH_FORM_CONTENT_TYPE,
  OAuthErrorResponse,
  noStoreHeaders,
  wwwAuthenticateHeaders,
} from "@/lib/api/domain-schemas/oidc";
import { API_TAGS } from "@/lib/api/tags";
import { handleOidcRevokeRequest } from "./revoke-handler";

const ROUTE = "/api/oidc/revoke";

export const OidcRevocationRequest = z
  .object({
    token: z.string().openapi({ description: "REQUIRED. The refresh token or access token to revoke." }),
    token_type_hint: z.enum(["access_token", "refresh_token"]).optional().openapi({
      description: "Accepted but unused: the token kind is read from the token itself.",
    }),
    client_id: appIdSchema.optional().openapi({
      description:
        "The client the token was issued to. A public client identifies itself with it alone; a confidential client may send it in its HTTP Basic credentials instead.",
    }),
    client_secret: z.string().optional().openapi({ description: "`client_secret_post` authentication, for confidential clients." }),
  })
  .openapi("OidcRevocationRequest");

export const postOidcRevoke = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Token revocation",
  description:
    "The OAuth 2.0 token revocation endpoint (RFC 7009), advertised as `revocation_endpoint`. A client POSTs a token issued to it and the token stops working: " +
    "a refresh token can no longer be redeemed, and the access tokens minted alongside it (in the same token response) are revoked with it; " +
    "an `oidc-userinfo` access token is refused by `/api/oidc/userinfo` and reported inactive by introspection. " +
    "Access tokens minted for an API server (an RFC 8707 `resource`) are answered with `unsupported_token_type`: revoke the refresh token they were issued with. " +
    "A token that is not a live token of this server (malformed, expired or already revoked) also yields 200, as §2.2 requires, while a live token issued to another client is refused with `invalid_grant`. " +
    "The success response has an empty body and `Cache-Control: no-store`; every response carries `Access-Control-Allow-Origin: *` (no cookies are read).",
  tags: [API_TAGS.oidc],
  auth: publicAccess(
    "Client authentication as at the token endpoint (RFC 7009 §2.1): a confidential client (an app with a registered client secret) MUST authenticate with `client_secret_basic` (HTTP Basic `Authorization` header) or `client_secret_post` (`client_secret` form field); a public client identifies itself with `client_id` alone. The handler performs this itself.",
  ),
  request: {
    body: {
      contentType: OAUTH_FORM_CONTENT_TYPE,
      schema: OidcRevocationRequest,
      documentOnly: true,
    },
  },
  responses: {
    200: {
      description: "The token was revoked, or was not a live token of this server (empty body)",
      headers: noStoreHeaders,
    },
    400: {
      description:
        "Not form-encoded, `token` missing, a malformed Basic `Authorization` header or both client authentication methods (`invalid_request`); an access token minted for an API server (`unsupported_token_type`); a live token issued to another client (`invalid_grant`)",
      schema: OAuthErrorResponse,
    },
    401: {
      description:
        "No or a malformed `client_id`, an unknown client, a confidential client without its secret or with a wrong one, or a secret sent for a public client (`invalid_client`)",
      schema: OAuthErrorResponse,
      headers: wwwAuthenticateHeaders,
    },
    500: { description: "The revocation request could not be processed (`server_error`)", schema: OAuthErrorResponse },
  },
  handler: (ctx) => handleOidcRevokeRequest(toNextRequest(ctx.request)),
});
