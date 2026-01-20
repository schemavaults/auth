import { z } from "zod";
import { apiServerIdSchema } from './api-server-id';
import { schemaVaultsAppEnvironmentSchema } from "./app-environments";

export const schemaVaultsApiServerDefinitionSchema = z.object({
  api_server_id: apiServerIdSchema,
  api_server_name: z.string().max(64),
  api_server_description: z.string().max(512),
  created_at: z.number().nonnegative(),
  public: z.boolean(), // whether the app is publicly listed
  hardcoded: z.boolean(),
  owner_organization_id: z.string().nullable().optional()
}).required({
  api_server_id: true,
  api_server_name: true,
  created_at: true,
  public: true,
  hardcoded: true
}).strict();

export type SchemaVaultsApiServerDefinition = z.infer<typeof schemaVaultsApiServerDefinitionSchema>;

export const schemaVaultsApiServerDomainRefSchema = z.object({
  api_server_domain_ref_id: z.string().uuid(),
  api_server_id: apiServerIdSchema,
  domain: z.string().max(255),
  environment: schemaVaultsAppEnvironmentSchema,
  created_at: z.number().nonnegative(),
  hardcoded: z.boolean()
}).required({
  api_server_domain_ref_id: true,
  api_server_id: true,
  domain: true,
  environment: true,
  created_at: true,
  hardcoded: true
}).strict();

export type SchemaVaultsApiServerDomainRef = z.infer<typeof schemaVaultsApiServerDomainRefSchema>;
