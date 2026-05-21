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

export function isValidSchemaVaultsAppEnvironment(
  val: unknown,
): val is SchemaVaultsAppEnvironment {
  if (typeof val !== "string") return false;
  return schemaVaultsAppEnvironmentSchema.safeParse(val).success;
}

export default schemaVaultsAppEnvironmentSchema;
