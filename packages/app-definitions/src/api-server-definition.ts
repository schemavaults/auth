import { z } from "zod";
import { apiServerIdSchema } from "./api-server-id";
import { schemaVaultsAppEnvironmentSchema } from "./app-environments";

// THIS SHOULD NOT BE USED OUTSIDE OF @schemavaults/app-definitions
// schemaVaultsApiServerDefinitionSchema restricts the scope of api_server_id after applying hardcoded api ids
const baseSchemaVaultsApiServerDefinitionSchema = z
  .object({
    api_server_id: z.string(),
    api_server_name: z.string().max(64),
    api_server_description: z.string().max(512),
    created_at: z.number().nonnegative(),
    public: z.boolean(), // whether the app is publicly listed
    hardcoded: z.boolean(),
    owner_organization_id: z.string().nullable().optional(),
  })
  .required({
    api_server_id: true,
    api_server_name: true,
    created_at: true,
    public: true,
    hardcoded: true,
  })
  .strict();

export type SchemaVaultsApiServerDefinition = z.infer<
  typeof baseSchemaVaultsApiServerDefinitionSchema
>;

export const schemaVaultsApiServerDefinitionSchema =
  baseSchemaVaultsApiServerDefinitionSchema.refine(
    (values) => apiServerIdSchema.safeParse(values.api_server_id).success,
    "Invalid API server ID",
  );

export const schemaVaultsApiServerDomainRefSchema = z
  .object({
    api_server_domain_ref_id: z.string().uuid(),
    api_server_id: apiServerIdSchema,
    domain: z.string().max(255),
    environment: schemaVaultsAppEnvironmentSchema,
    created_at: z.number().nonnegative(),
    hardcoded: z.boolean(),
  })
  .required({
    api_server_domain_ref_id: true,
    api_server_id: true,
    domain: true,
    environment: true,
    created_at: true,
    hardcoded: true,
  })
  .strict();

export type SchemaVaultsApiServerDomainRef = z.infer<
  typeof schemaVaultsApiServerDomainRefSchema
>;
