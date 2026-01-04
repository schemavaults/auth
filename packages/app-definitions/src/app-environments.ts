import { z } from "zod";

export const schemaVaultsAppEnvironments = [
  "development",
  "staging",
  "test",
  "production",
] as const satisfies readonly string[];

export const schemaVaultsAppEnvironmentSchema = z.enum(
  schemaVaultsAppEnvironments,
);

export type SchemaVaultsAppEnvironment = z.infer<
  typeof schemaVaultsAppEnvironmentSchema
>;

export default schemaVaultsAppEnvironmentSchema;
