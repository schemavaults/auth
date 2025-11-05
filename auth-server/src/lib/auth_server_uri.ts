import { getHardcodedClientWebAppDomain, SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";

export function getAuthServerUri(): string {
  return getHardcodedClientWebAppDomain(
    SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
    process.env.NODE_ENV
  );
}
