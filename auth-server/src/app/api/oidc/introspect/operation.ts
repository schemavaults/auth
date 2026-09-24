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
import { handleOidcIntrospectRequest } from "./introspect-handler";

const ROUTE = "/api/oidc/introspect";

export const OidcIntrospectionRequest = z
  .object({
    token: z.string().openapi({ description: "REQUIRED. The access or refresh token to introspect." }),
    token_type_hint: z.enum(["access_token", "refresh_token"]).optional().openapi({
      description: "Accepted but unused: the token kind is read from the token itself.",
    }),
    client_id: appIdSchema.optional().openapi({
      description: "The confidential client's id; may be omitted with `client_secret_basic`.",
    }),
    client_secret: z.string().optional().openapi({ description: "`client_secret_post` authentication." }),
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
    "The OAuth 2.0 token introspection endpoint (RFC 7662), advertised as `introspection_endpoint`. A confidential client POSTs an access or refresh token issued by this server and learns whether it is currently active plus its metadata (scope, client, subject, expiry). Tokens minted for other resource-API audiences, tokens issued to a different client, expired and revoked tokens all yield `{ \"active\": false }`. " +
    "Public (PKCE-only) clients cannot introspect: without client authentication the endpoint would be open to token scanning. Responses carry `Cache-Control: no-store` and `Access-Control-Allow-Origin: *`.",
  tags: [API_TAGS.oidc],
  auth: publicAccess(
    "Client authentication is REQUIRED (RFC 7662 §2.1): `client_secret_basic` (HTTP Basic `Authorization` header) or `client_secret_post` (`client_secret` form field) of an app with a registered client secret. The handler performs this itself; `none` is not accepted.",
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
      description: "Not form-encoded, `token` missing, malformed `client_id`, or a malformed Basic `Authorization` header (`invalid_request`)",
      schema: OAuthErrorResponse,
    },
    401: {
      description: "No client identified, the client secret is wrong, or the client is not confidential (`invalid_client`)",
      schema: OAuthErrorResponse,
      headers: wwwAuthenticateHeaders,
    },
    500: { description: "The introspection request could not be processed", schema: OAuthErrorResponse },
  },
  handler: (ctx) => handleOidcIntrospectRequest(toNextRequest(ctx.request)),
});
