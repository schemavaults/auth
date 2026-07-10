import { getAppEnvironment, getAuthServerUrl, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export function getAuthServerUri(
  environment: SchemaVaultsAppEnvironment = getAppEnvironment()
): string {
  return getAuthServerUrl(environment)
}
