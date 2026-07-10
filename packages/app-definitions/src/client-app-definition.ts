import { z } from "zod";
import { appIdSchema } from "./app-id";
import { schemaVaultsAppEnvironmentSchema } from "./app-environments";

export const schemaVaultsAppDefinitionSchema = z
  .object({
    app_id: appIdSchema.describe("Client Application ID"),
    app_name: z.string().max(64),
    app_description: z.string().max(512),
    created_at: z.number().nonnegative(),
    public: z.boolean(), // whether the app is publicly listed
    hardcoded: z.boolean(),
    web: z.boolean(), // whether this app can be opened by url or requires native installation
    owner_organization_id: z.string().nullable().optional(),
  })
  .required({
    app_id: true,
    app_name: true,
    created_at: true,
    public: true,
    hardcoded: true,
    web: true,
  })
  .strict();

export type SchemaVaultsApp = z.infer<typeof schemaVaultsAppDefinitionSchema>;

export const schemaVaultsAppDomainRefSchema = z
  .object({
    app_domain_ref_id: z.string().uuid(),
    app_id: appIdSchema,
    domain: z.string().max(255),
    environment: schemaVaultsAppEnvironmentSchema,
    created_at: z.number().nonnegative(),
    hardcoded: z.boolean(),
  })
  .required({
    app_domain_ref_id: true,
    app_id: true,
    domain: true,
    environment: true,
    created_at: true,
    hardcoded: true,
  })
  .strict();

export type SchemaVaultsAppDomainRef = z.infer<
  typeof schemaVaultsAppDomainRefSchema
>;
