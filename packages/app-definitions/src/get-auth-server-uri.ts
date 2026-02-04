import type { SchemaVaultsAppEnvironment } from "./app-environments";
import { getAppEnvironment } from "./get-app-environment";
import { getHardcodedClientWebAppDomain } from "./get-hardcoded-client-web-app-domain";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "./hardcoded-core-schemavaults-apps";

export function getAuthServerUri(
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): string {
  return getHardcodedClientWebAppDomain(
    SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    environment,
  );
}

export default getAuthServerUri;
