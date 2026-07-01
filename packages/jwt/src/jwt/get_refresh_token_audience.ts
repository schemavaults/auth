import {
  getAppEnvironment,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export default function getRefreshTokenAudience(
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): string {
  return getAuthServerUrl(environment);
}
