import { getAppEnvironment, getHardcodedClientWebAppDomain, SCHEMAVAULTS_AUTH_APP_DEFINITION, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export function getAuthServerUri(): string {
  return getHardcodedClientWebAppDomain(
    SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    getAppEnvironment() satisfies SchemaVaultsAppEnvironment
  );
}
