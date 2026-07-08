import type { SchemaVaultsAppEnvironment } from "./app-environments";
import { type AppId, isValidAppId } from "./app-id";
import blankUuid from "./blank-uuid";
import type {
  SchemaVaultsApp,
  SchemaVaultsAppDomainRef,
} from "./client-app-definition";
import defaultHardcodedAppCreationTime from "./default-hardcoded-app-creation-time";
import getAppEnvironment from "./get-app-environment";
import getAuthServerUrl from "./get-auth-server-url";
import getSchemaVaultsAuthAppDefinition from "./get-schemavaults-auth-app-definition";
import SCHEMAVAULTS_AUTH_APP_ID from "./SCHEMAVAULTS_AUTH_APP_ID";

export const HARDCODED_APP_IDS = [
  SCHEMAVAULTS_AUTH_APP_ID,
] as const satisfies readonly AppId[];

export type HardcodedAppId = (typeof HARDCODED_APP_IDS)[number];

const HARDCODED_APP_ID_SET = new Set<string>(HARDCODED_APP_IDS);

/**
 * @description Builds the hardcoded app definitions fresh on each call so
 * env-var-driven fields (owner organization, name, description) are resolved
 * at call time rather than module load.
 */
export function getHardcodedSchemaVaultsApps(): readonly SchemaVaultsApp[] {
  return [getSchemaVaultsAuthAppDefinition()];
}

export function isHardcodedAppId(app_id: AppId): app_id is HardcodedAppId {
  if (!isValidAppId(app_id)) {
    throw new TypeError("Invalid app ID to check if it is hardcoded!");
  }
  return HARDCODED_APP_ID_SET.has(app_id);
}

export function getHardcodedApp(
  hardcoded_app_id: HardcodedAppId,
): SchemaVaultsApp {
  const app = getHardcodedSchemaVaultsApps().find(
    (app) => app.app_id === hardcoded_app_id,
  );
  if (!app) {
    throw new Error("No hardcoded app found with given 'hardcoded_app_id'!");
  }
  return app;
}

export function getHardcodedAppDomains(
  hardcoded_app_id: HardcodedAppId,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): readonly SchemaVaultsAppDomainRef[] {
  if (!isHardcodedAppId(hardcoded_app_id)) {
    throw new TypeError(
      "Failed to find hardcoded SchemaVault app definition for specified app ID",
      {
        cause: `'${hardcoded_app_id}' does not appear to be a hardcoded app ID!`,
      },
    );
  }

  const output: SchemaVaultsAppDomainRef[] = [];

  if (hardcoded_app_id === SCHEMAVAULTS_AUTH_APP_ID) {
    output.push({
      app_id: SCHEMAVAULTS_AUTH_APP_ID,
      environment,
      app_domain_ref_id: blankUuid,
      hardcoded: true,
      created_at: defaultHardcodedAppCreationTime,
      domain: getAuthServerUrl(environment),
    });
  }

  return output;
}
