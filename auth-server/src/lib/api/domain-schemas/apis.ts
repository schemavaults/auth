import { z, withOpenApi } from "@schemavaults/openapi-operations";
import {
  apiServerDomainVerificationMethodSchema,
  apiServerDomainVerificationSchema,
  apiServerIdSchema,
  schemaVaultsApiServerDefinitionSchema,
  schemaVaultsApiServerDomainRefSchema,
} from "@schemavaults/app-definitions";
import {
  apiServerScopeSchema,
  createApiServerScopeRequestSchema,
  updateApiServerScopeRequestSchema,
} from "@schemavaults/auth-common";

/**
 * Schemas shared by the operations of the "API servers" domain
 * (`src/app/api/apis/**`).
 */

/** An API server (resource server) registration. */
export const ApiServerDefinition = withOpenApi(schemaVaultsApiServerDefinitionSchema, "ApiServerDefinition", {
  description:
    "An API server (resource server) registration: identity, listing visibility, ownership (platform / organization / user), dynamic-client policy, organization membership visibility and delegated-token policy.",
});

/** A domain registered for an API server in one app environment. */
export const ApiServerDomainRef = withOpenApi(schemaVaultsApiServerDomainRefSchema, "ApiServerDomainRef", {
  description: "A domain an API server is reachable at in one app environment.",
});

/** `{ api_server_id }` path parameters of every `/api/apis/{api_server_id}/**` operation. */
export const apiServerParams = z.object({
  api_server_id: withOpenApi(apiServerIdSchema, { description: "API server id", example: "my-resource-api" }),
});

/** `ListApiServersQueryResponse` (success branch) from `@schemavaults/app-definitions`. */
export const ListApiServersResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    list: z.array(ApiServerDefinition).readonly(),
  })
  .openapi("ListApiServersResponse");

/** `{ success: true, api_server }` returned by the single-API-server operations. */
export const ApiServerResponse = z
  .object({ success: z.literal(true), api_server: ApiServerDefinition })
  .openapi("ApiServerResponse");

/** `{ api_server_id, api_server_domain_ref_id }` path parameters of `/api/apis/{api_server_id}/domains/{api_server_domain_ref_id}`. */
export const apiServerDomainParams = apiServerParams.extend({
  api_server_domain_ref_id: z.guid().openapi({ description: "The API server domain reference id" }),
});

/** Ownership verification state of a domain registered for an API server (migration 00057). */
export const ApiServerDomainVerification = withOpenApi(
  apiServerDomainVerificationSchema,
  "ApiServerDomainVerification",
  {
    description:
      "Whether the ownership of a registered domain is verified. RFC 8707 `resource` URLs resolve to an API server only through its verified domains. To verify through DNS, publish `dns_txt_record` (a TXT record named `name` with the value `value`) and keep it published, then call `POST /api/apis/{api_server_id}/domains/{api_server_domain_ref_id}/verify`. `dns_txt_record` is null for hosts DNS cannot verify (loopback and IP-literal hosts, single-label names), which only a platform administrator can verify.",
  },
);

export const ListApiServerDomainsResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    list: z.array(ApiServerDomainRef).readonly(),
    verifications: z.array(ApiServerDomainVerification).readonly().openapi({
      description:
        "The verification state of each domain in `list`, matched by `api_server_domain_ref_id`. Empty for hardcoded API servers, whose domains come from the server's configuration and never resolve resource URLs.",
    }),
  })
  .openapi("ListApiServerDomainsResponse");

/** Response of `POST /api/apis/{api_server_id}/domains`. */
export const AddApiServerDomainResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    resource_id: z.string().openapi({ description: "The API server id" }),
    verification: ApiServerDomainVerification,
  })
  .openapi("AddApiServerDomainResponse");

/** Body of `POST /api/apis/{api_server_id}/domains/{api_server_domain_ref_id}/verify`. */
export const VerifyApiServerDomainRequest = z
  .object({
    method: apiServerDomainVerificationMethodSchema.optional().openapi({
      description:
        "`dns_txt` (default): look up the domain's TXT record. `administrator`: attest the domain without DNS (platform administrators only).",
    }),
  })
  .strict()
  .openapi("VerifyApiServerDomainRequest");

/** Answer of a verification attempt, successful or not. */
export const VerifyApiServerDomainResponse = z
  .object({
    success: z.boolean(),
    error: z
      .enum(["verification_record_not_found", "domain_not_dns_verifiable", "dns_lookup_failed"])
      .optional()
      .openapi({ description: "Why the domain is not verified (absent on success)" }),
    message: z.string(),
    verification: ApiServerDomainVerification,
  })
  .openapi("VerifyApiServerDomainResponse");

/** A scope an API server defines (an "API scope"). */
export const ApiServerScope = withOpenApi(apiServerScopeSchema, "ApiServerScope", {
  description:
    "An OAuth 2.0 scope value (RFC 6749 §3.3) an API server defines for itself, with the description shown to users. Clients request it on an authorization request whose RFC 8707 `resource` names the API server; it is granted on the access tokens minted for that API server.",
});

/** `{ api_server_id, api_server_scope_id }` path parameters of `/api/apis/{api_server_id}/scopes/{api_server_scope_id}`. */
export const apiServerScopeParams = apiServerParams.extend({
  api_server_scope_id: z.guid().openapi({ description: "Id of the API scope definition" }),
});

export const ListApiServerScopesResponse = z
  .object({
    success: z.literal(true),
    list: z.array(ApiServerScope).readonly(),
  })
  .openapi("ListApiServerScopesResponse");

export const ApiServerScopeResponse = z
  .object({ success: z.literal(true), scope: ApiServerScope })
  .openapi("ApiServerScopeResponse");

export const CreateApiServerScopeRequest = withOpenApi(
  createApiServerScopeRequestSchema,
  "CreateApiServerScopeRequest",
  {
    description:
      "`scope`: a single RFC 6749 scope-token (printable ASCII without spaces, `\"` or `\\`, at most 128 characters) that is not an OpenID Connect scope name (`openid`, `profile`, `email`, `address`, `phone`, `offline_access`). `description`: 1 to 256 characters, shown to users. `allow_dynamic_clients` (default true): whether dynamically registered clients, which have no app connection, may be granted it. Unknown keys are rejected.",
  },
);

export const UpdateApiServerScopeRequest = withOpenApi(
  updateApiServerScopeRequestSchema,
  "UpdateApiServerScopeRequest",
  {
    description:
      "The description and/or `allow_dynamic_clients` (at least one). The scope value is immutable (define a new scope and delete the old one to rename). Unknown keys are rejected.",
  },
);

/** `JwksAccessKeyStatusQueryResponse` from `@/lib/auth-db/jwks-access-keys`: key metadata without the key itself. */
export const JwksAccessKeyStatus = z
  .object({
    key_id: z.string().openapi({ description: "Identifier of the active JWKS access key pair" }),
    created_at: z.number().openapi({ description: "Unix epoch milliseconds" }),
    is_active: z.boolean(),
  })
  .openapi("JwksAccessKeyStatus");

/** `KeyMetadataResponse` (success branch) consumed by the JWKS access keys page. */
export const JwksAccessKeyMetadataResponse = z
  .object({
    success: z.literal(true),
    key_metadata: z.union([JwksAccessKeyStatus, z.literal(false)]).openapi({
      description: "Metadata of the active key, or `false` when no JWKS access key has been generated yet",
    }),
  })
  .openapi("JwksAccessKeyMetadataResponse");

/** Returned once when a JWKS access key pair is generated or regenerated. */
export const JwksAccessKeyGeneratedResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    key_id: z.string().openapi({ description: "Identifier of the new key pair" }),
    private_key: z.string().openapi({
      description:
        "PEM-encoded private key. Shown exactly once; the auth server keeps only the public key.",
    }),
  })
  .openapi("JwksAccessKeyGeneratedResponse");
