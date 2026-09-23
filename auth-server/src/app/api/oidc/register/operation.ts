import { toNextRequest } from "@/lib/api/next-request";
import {
  DYNAMIC_CLIENT_CONTACT_MAX_LENGTH,
  DYNAMIC_CLIENT_MAX_CONTACTS,
  DYNAMIC_CLIENT_METADATA_URI_MAX_LENGTH,
  DYNAMIC_CLIENT_SCOPE_MAX_LENGTH,
  DYNAMIC_CLIENT_SOFTWARE_FIELD_MAX_LENGTH,
  dynamicClientGrantTypeSchema,
  dynamicClientResponseTypeSchema,
  dynamicClientTokenEndpointAuthMethodSchema,
} from "@schemavaults/app-definitions";
import {
  DYNAMIC_CLIENT_MAX_REDIRECT_URIS,
  dynamicClientRegistrationErrorSchema,
  dynamicClientRegistrationResponseSchema,
} from "@schemavaults/auth-common";
import { z, publicAccess, withOpenApi } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { OAuthErrorResponse, noStoreHeaders } from "@/lib/api/domain-schemas/oidc";
import { ErrorResponse, RateLimitedResponse } from "@/lib/api/schemas";
import { API_TAGS } from "@/lib/api/tags";
import { handleDynamicClientRegistrationRequest } from "./register-handler";

const ROUTE = "/api/oidc/register";

const metadataUri = (description: string) =>
  z.url().max(DYNAMIC_CLIENT_METADATA_URI_MAX_LENGTH).optional().openapi({ description });

/** RFC 7591 §2 client metadata as this server accepts it (documents `DynamicClientRegistrationRequest` from @schemavaults/auth-common). */
export const DynamicClientRegistrationRequest = z
  .object({
    redirect_uris: z
      .array(z.string())
      .min(1)
      .max(DYNAMIC_CLIENT_MAX_REDIRECT_URIS)
      .openapi({
        description:
          "REQUIRED. Absolute URIs without a fragment: `https`, `http` loopback-IP URIs and, when the deployment allows them, `http://localhost` URIs and private-use scheme URIs.",
        example: ["https://app.example.com/oauth/callback"],
      }),
    client_name: z.string().optional().openapi({ description: "Display name; derived from the first redirect URI when absent." }),
    token_endpoint_auth_method: dynamicClientTokenEndpointAuthMethodSchema.optional().openapi({
      description: "Default `client_secret_basic` (RFC 7591 §2); `none` registers a public PKCE-only client.",
    }),
    grant_types: z.array(dynamicClientGrantTypeSchema).optional().openapi({
      description: "Default `[\"authorization_code\"]`; must include `authorization_code`.",
    }),
    response_types: z.array(dynamicClientResponseTypeSchema).optional().openapi({ description: "Default `[\"code\"]`." }),
    client_uri: metadataUri("The client's home page."),
    logo_uri: metadataUri("Logo to show on consent screens."),
    tos_uri: metadataUri("Terms of service."),
    policy_uri: metadataUri("Privacy policy."),
    contacts: z
      .array(z.string().min(1).max(DYNAMIC_CLIENT_CONTACT_MAX_LENGTH))
      .max(DYNAMIC_CLIENT_MAX_CONTACTS)
      .optional()
      .openapi({ description: "Ways to contact the people responsible for the client." }),
    scope: z.string().max(DYNAMIC_CLIENT_SCOPE_MAX_LENGTH).optional().openapi({
      description: "Space-separated scopes the client intends to request (recorded, not enforced).",
    }),
    software_id: z.string().max(DYNAMIC_CLIENT_SOFTWARE_FIELD_MAX_LENGTH).optional(),
    software_version: z.string().max(DYNAMIC_CLIENT_SOFTWARE_FIELD_MAX_LENGTH).optional(),
  })
  .loose()
  .openapi("DynamicClientRegistrationRequest", {
    description:
      "Unknown members are ignored (RFC 7591 §2). `jwks`, `jwks_uri` and `software_statement` are not supported and refused with `invalid_client_metadata`.",
  });

export const DynamicClientRegistrationResponse = withOpenApi(dynamicClientRegistrationResponseSchema, 
  "DynamicClientRegistrationResponse",
  {
    description:
      "RFC 7591 §3.2.1 registration response. `client_secret` is returned once, only for confidential clients; `client_secret_expires_at` is 0 (secrets do not expire).",
  },
);

export const DynamicClientRegistrationError = withOpenApi(dynamicClientRegistrationErrorSchema, 
  "DynamicClientRegistrationError",
  { description: "RFC 7591 §3.2.2 error: `invalid_redirect_uri` or `invalid_client_metadata`." },
);

export const postOidcRegister = defineOperation({
  method: "post",
  path: ROUTE,
  summary: "Dynamic client registration",
  description:
    "OAuth 2.0 Dynamic Client Registration (RFC 7591 §3) for MCP and other OAuth clients. Off by default: the `allow_dynamic_client_registration` server setting must be on (the discovery document advertises `registration_endpoint` only then). " +
    "A valid request creates an ownerless client application (`owner_type = dynamic-client-registration`, manageable by platform administrators only) with its redirect URIs registered as explicit callback URLs and, for confidential clients, a generated client secret. Registrations are rate limited per IP; bodies over 128 KiB are refused with 413. RFC 7592 configuration management is not implemented. Responses carry `Cache-Control: no-store` and `Access-Control-Allow-Origin: *`.",
  tags: [API_TAGS.oidc],
  auth: publicAccess("Open registration: no initial access token or other credential is required."),
  request: {
    body: {
      contentType: "application/json",
      schema: DynamicClientRegistrationRequest,
      documentOnly: true,
    },
  },
  responses: {
    201: { description: "The client was registered", schema: DynamicClientRegistrationResponse, headers: noStoreHeaders },
    400: {
      description:
        "The body is not a JSON object or the metadata is invalid (`invalid_client_metadata` / `invalid_redirect_uri`), or the client IP could not be determined for rate limiting (`{ success: false, message }`)",
      schema: z.union([DynamicClientRegistrationError, ErrorResponse]),
    },
    403: { description: "Dynamic client registration is disabled on this server (`access_denied`)", schema: OAuthErrorResponse },
    413: { description: "The request body exceeds 128 KiB (`invalid_client_metadata`)", schema: DynamicClientRegistrationError },
    429: { description: "Rate limited", schema: RateLimitedResponse },
    500: { description: "The registration could not be processed (`server_error`)", schema: OAuthErrorResponse },
  },
  handler: (ctx) => handleDynamicClientRegistrationRequest(toNextRequest(ctx.request)),
});
