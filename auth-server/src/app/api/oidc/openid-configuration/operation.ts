import { NextResponse } from "next/server";
import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { API_TAGS } from "@/lib/api/tags";
import { buildOidcDiscoveryDocument } from "@/lib/oidc/discovery-document";
import { isDynamicClientRegistrationEnabled } from "@/lib/oidc/dynamic-client-registration";

const ROUTE = "/api/oidc/openid-configuration";

const endpointUrl = (description: string, path: string) =>
  z.string().openapi({ description, example: `https://auth.example.com${path}` });

/** OpenID Provider Metadata (OIDC Discovery 1.0 §3), a superset of RFC 8414 metadata. */
export const OidcProviderMetadata = z
  .object({
    issuer: z.string().openapi({
      description: "Issuer identifier; byte-identical to the `iss` claim of issued id_tokens (no trailing slash).",
      example: "https://auth.example.com",
    }),
    authorization_endpoint: endpointUrl("The authorization endpoint", "/api/oidc/authorize"),
    token_endpoint: endpointUrl("The token endpoint", "/api/oidc/token"),
    userinfo_endpoint: endpointUrl("The userinfo endpoint", "/api/oidc/userinfo"),
    introspection_endpoint: endpointUrl("RFC 7662 token introspection endpoint", "/api/oidc/introspect"),
    jwks_uri: endpointUrl("Public RS256 id_token verification keys", "/api/oidc/jwks"),
    registration_endpoint: endpointUrl(
      "RFC 7591 dynamic client registration endpoint. Present only while the `allow_dynamic_client_registration` server setting is on.",
      "/api/oidc/register",
    ).optional(),
    response_types_supported: z.array(z.string()).openapi({ example: ["code"] }),
    response_modes_supported: z.array(z.string()).openapi({ example: ["query"] }),
    grant_types_supported: z
      .array(z.string())
      .openapi({ example: ["authorization_code", "refresh_token", "client_credentials"] }),
    subject_types_supported: z.array(z.string()).openapi({ example: ["public"] }),
    id_token_signing_alg_values_supported: z.array(z.string()).openapi({ example: ["RS256"] }),
    scopes_supported: z.array(z.string()).openapi({ example: ["openid", "email", "profile"] }),
    token_endpoint_auth_methods_supported: z
      .array(z.string())
      .openapi({ example: ["none", "client_secret_basic", "client_secret_post"] }),
    introspection_endpoint_auth_methods_supported: z
      .array(z.string())
      .openapi({ example: ["client_secret_basic", "client_secret_post"] }),
    code_challenge_methods_supported: z.array(z.string()).openapi({ example: ["S256"] }),
    claims_supported: z.array(z.string()),
    authorization_response_iss_parameter_supported: z
      .boolean()
      .openapi({ description: "RFC 9207: every authorization response carries `iss`.", example: true }),
    request_parameter_supported: z.boolean().openapi({ example: false }),
    request_uri_parameter_supported: z.boolean().openapi({ example: false }),
  })
  .loose()
  .openapi("OidcProviderMetadata");

export const getOpenIdConfiguration = defineOperation({
  method: "get",
  path: ROUTE,
  summary: "OpenID Provider metadata (discovery)",
  description:
    "OIDC Discovery 1.0 §4 provider-configuration document. Relying parties normally fetch it at the spec-fixed paths `/.well-known/openid-configuration` and, for plain OAuth 2.0 clients (RFC 8414), `/.well-known/oauth-authorization-server`; both are rewritten to this route (OpenID Provider Metadata is a superset of RFC 8414 metadata, so one document serves both). " +
    "`registration_endpoint` is advertised only while dynamic client registration is enabled by the `allow_dynamic_client_registration` server setting; a failure to read that setting degrades to not advertising it. Cached for an hour (`Cache-Control: public, max-age=3600`) and served with `Access-Control-Allow-Origin: *`.",
  tags: [API_TAGS.oidc],
  auth: publicAccess("Unauthenticated by design: the document is public."),
  responses: {
    200: { description: "The provider metadata", schema: OidcProviderMetadata },
  },
  handler: async (ctx) => {
    let registration_endpoint: boolean = false;
    try {
      registration_endpoint = await isDynamicClientRegistrationEnabled(ctx.context.db);
    } catch (e: unknown) {
      console.error(
        `[${ROUTE}] Failed to read the dynamic client registration setting; not advertising registration_endpoint:`,
        e,
      );
    }
    return NextResponse.json(buildOidcDiscoveryDocument(undefined, { registration_endpoint }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
});
