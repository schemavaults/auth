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
import SCHEMAVAULTS_AUTH_APP_DEFINITION from "./SCHEMAVAULTS_AUTH_APP_DEFINITION";
import SCHEMAVAULTS_AUTH_APP_ID from "./SCHEMAVAULTS_AUTH_APP_ID";

export const HARDCODED_SCHEMAVAULTS_APPS = [
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
] as const satisfies readonly SchemaVaultsApp[];

export type HardcodedAppId =
  (typeof HARDCODED_SCHEMAVAULTS_APPS)[number]["app_id"];

const HARDCODED_APP_IDS = new Set<string>(
  HARDCODED_SCHEMAVAULTS_APPS.map((x) => x.app_id),
);

export function isHardcodedAppId(app_id: AppId): app_id is HardcodedAppId {
  if (!isValidAppId(app_id)) {
    throw new TypeError("Invalid app ID to check if it is hardcoded!");
  }
  return HARDCODED_APP_IDS.has(app_id);
}

export function getHardcodedApp(
  hardcoded_app_id: HardcodedAppId,
): SchemaVaultsApp {
  const app = HARDCODED_SCHEMAVAULTS_APPS.find(
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
