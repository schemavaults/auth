import { getHardcodedClientWebAppDomain } from "./get-hardcoded-client-web-app-domain";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "./hardcoded-core-schemavaults-apps";

export const PRODUCTION_AUTH_SERVER_URL = getHardcodedClientWebAppDomain(
  SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
  'production'
);
