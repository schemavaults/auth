import { toNextRequest } from "@/lib/api/next-request";
import { appIdSchema } from "@schemavaults/app-definitions";
import {
  DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS,
  DEVICE_AUTHORIZATION_EXPIRES_IN_SECONDS,
} from "@schemavaults/auth-common";
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
import { handleOidcDeviceAuthorizationRequest } from "./device-authorization-handler";

const ROUTE = "/api/oidc/device_authorization";

export const OidcDeviceAuthorizationRequest = z
  .object({
    client_id: appIdSchema.optional().openapi({
      description:
        "The client application id. May be omitted when a confidential client authenticates with `client_secret_basic` (the id then comes from the `Authorization` header).",
      example: "my-cli",
    }),
    client_secret: z.string().optional().openapi({
      description: "`client_secret_post` authentication, for confidential clients.",
    }),
    scope: z.string().optional().openapi({
      description:
        "OPTIONAL. Space-delimited scopes, as at the authorization endpoint: with `openid` the device also receives an id_token; API scopes of the API server named by `resource` may be asked for. Unknown scopes are ignored. What is granted is decided when the user approves the request.",
      example: "openid email profile",
    }),
    resource: z.string().optional().openapi({
      description:
        "OPTIONAL. RFC 8707 resource indicator naming the API server whose API scopes `scope` asks for (an API server id or the URL of one of its registered domains). At most one.",
      example: "https://api.example.com",
    }),
  })
  .openapi("OidcDeviceAuthorizationRequest");

export const OidcDeviceAuthorizationResponse = z
  .object({
    device_code: z.string().openapi({
      description: "The device verification code: poll the token endpoint with it (`grant_type=urn:ietf:params:oauth:grant-type:device_code`). Never show it to the user.",
    }),
    user_code: z.string().openapi({
      description: "The code the user enters on the verification page: 8 consonants in two groups of four. Entry is case-insensitive and ignores the dash.",
      example: "BCDF-GHJK",
    }),
    verification_uri: z.string().openapi({
      description: "The auth server's `/device` page, where the user enters the code. Show it with the user code.",
      example: "https://auth.example.com/device",
    }),
    verification_uri_complete: z.string().openapi({
      description: "The `/device` page with the code filled in, for a link or QR code. Still show the user code so the user can compare it with the page.",
      example: "https://auth.example.com/device?user_code=BCDF-GHJK",
    }),
    expires_in: z.number().int().openapi({
      description: "Seconds until both codes expire.",
      example: DEVICE_AUTHORIZATION_EXPIRES_IN_SECONDS,
    }),
    interval: z.number().int().openapi({
      description: "Seconds to wait between polls; add 5 on every `slow_down`.",
      example: DEVICE_AUTHORIZATION_DEFAULT_INTERVAL_SECONDS,
    }),
  })
  .openapi("OidcDeviceAuthorizationResponse");

export const postOidcDeviceAuthorization = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Device authorization endpoint",
  description:
    "The OAuth 2.0 device authorization endpoint (RFC 8628 §3.1), advertised as `device_authorization_endpoint`: starts the device authorization grant for a device that cannot show the login page (a CLI, a TV app). " +
    "The response's `user_code` and `verification_uri` are shown to the user, who enters the code on the auth server's `/device` page, signs in and approves (or denies) the request; meanwhile the device polls `POST /api/oidc/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code` and the `device_code`, every `interval` seconds, until it receives its tokens or `access_denied` / `expired_token`. " +
    `Codes expire after ${DEVICE_AUTHORIZATION_EXPIRES_IN_SECONDS / 60} minutes. ` +
    "Only client applications whose managers enabled the grant (`PUT /api/apps/{app_id}/device-authorization`) may use it, never a dynamically registered client (`unauthorized_client`). Requests are rate limited per IP. Responses carry `Cache-Control: no-store` and `Access-Control-Allow-Origin: *` (no cookies are read).",
  tags: [API_TAGS.oidc],
  auth: publicAccess(
    "Client authentication as at the token endpoint (RFC 8628 §3.1): a confidential client (an app with a registered client secret) MUST authenticate with `client_secret_basic` or `client_secret_post`; a public client identifies itself with `client_id` alone. The handler performs this itself.",
  ),
  request: {
    body: {
      contentType: OAUTH_FORM_CONTENT_TYPE,
      schema: OidcDeviceAuthorizationRequest,
      documentOnly: true,
      description: "Form-encoded device authorization request.",
    },
  },
  responses: {
    200: {
      description: "The device authorization response (RFC 8628 §3.2)",
      schema: OidcDeviceAuthorizationResponse,
      headers: noStoreHeaders,
    },
    400: {
      description:
        "OAuth error: not form-encoded or a malformed Basic `Authorization` header (`invalid_request`), a malformed `scope` (`invalid_scope`), several or a malformed `resource` (`invalid_target`), a client that may not use the grant or whose managers have not enabled it (`unauthorized_client`); or the client IP could not be determined for rate limiting (`{ success: false, message }`).",
      schema: z.union([OAuthErrorResponse, ErrorResponse]),
    },
    401: {
      description:
        "No or a malformed `client_id`, HTTP Basic credentials naming another client than the form's `client_id`, an unknown client, a confidential client without its secret or with a wrong one, or a secret sent for a public client (`invalid_client`)",
      schema: OAuthErrorResponse,
      headers: wwwAuthenticateHeaders,
    },
    429: { description: "Rate limited", schema: RateLimitedResponse },
    500: { description: "The request could not be processed (`server_error`)", schema: OAuthErrorResponse },
  },
  handler: (ctx) => handleOidcDeviceAuthorizationRequest(toNextRequest(ctx.request)),
});
