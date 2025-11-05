import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export function getDefaultDebugState(
  environment: SchemaVaultsAppEnvironment,
): boolean {
  if (environment === "development") {
    return true;
  }
  return false;
}
