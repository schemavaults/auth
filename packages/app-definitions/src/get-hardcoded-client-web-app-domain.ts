import { schemaVaultsAppEnvironmentSchema, type SchemaVaultsAppEnvironment } from "./app-environments";
import { HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS } from "./hardcoded-core-schemavaults-app-domains";
import { HARDCODED_CORE_SCHEMAVAULTS_APPS } from "./hardcoded-core-schemavaults-apps";

const DEBUG: boolean = false;

export function getHardcodedClientWebAppDomain(
  web_app_id: string,
  environment: SchemaVaultsAppEnvironment
): string {
  if (
    typeof web_app_id !== 'string' ||
    !HARDCODED_CORE_SCHEMAVAULTS_APPS.some(app => app.app_id === web_app_id)
  ) {
    throw new Error("Failed to find hardcoded app with that app ID!");
  }

  if (!schemaVaultsAppEnvironmentSchema.safeParse(environment).success) {
    console.error("Invalid SchemaVaults app environment: ", environment)
    throw new Error("Invalid app environment!")
  }

  if (DEBUG) {
    console.log(
      `[getHardcodedClientWebAppDomain] ` +
      `Attempting to find domain for hardcoded app with ID: "${web_app_id}" in environment: "${environment}"`
    );
  }

  const appDomains = HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS.filter(
    app => app.app_id === web_app_id
  );
  if (appDomains.length === 0) {
    throw new Error(`No domains found for hardcoded app (with ID "${web_app_id}") (in any environment!)`);
  }

  const domainForAppEnv = appDomains.find(
    app_domain => app_domain.environment === environment
  );
  if (!domainForAppEnv) {
    console.error("App environment: ", environment);
    throw new Error(
      `No domains found for hardcoded app (with ID "${web_app_id}") in app environment "${environment}"`
    );
  }

  const domain: string = domainForAppEnv.domain;

  if (DEBUG) {
    console.log(
      `[getHardcodedClientWebAppDomain] ` +
      `Found domain for hardcoded app (with ID: "${web_app_id}") in environment "${environment}": `,
      domain
    );
  }

  return domain;
}
