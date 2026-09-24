import { z, withOpenApi } from "@schemavaults/openapi-operations";
import {
  apiServerIdSchema,
  schemaVaultsApiServerDefinitionSchema,
  schemaVaultsApiServerDomainRefSchema,
} from "@schemavaults/app-definitions";

/**
 * Schemas shared by the operations of the "API servers" domain
 * (`src/app/api/apis/**`).
 */

/** An API server (resource server) registration. */
export const ApiServerDefinition = withOpenApi(schemaVaultsApiServerDefinitionSchema, "ApiServerDefinition", {
  description:
    "An API server (resource server) registration: identity, listing visibility, ownership (platform / organization / user) and dynamic-client policy.",
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

export const ListApiServerDomainsResponse = z
  .object({
    success: z.literal(true),
    message: z.string(),
    list: z.array(ApiServerDomainRef).readonly(),
  })
  .openapi("ListApiServerDomainsResponse");

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
