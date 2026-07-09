import type {
  SchemaVaultsApiServerDefinition,
  SchemaVaultsApiServerDomainRef,
} from "./api-server-definition";
import { type ApiServerId, isValidApiServerId } from "./api-server-id";
import type { SchemaVaultsAppEnvironment } from "./app-environments";
import blankUuid from "./blank-uuid";
import defaultHardcodedAppCreationTime from "./default-hardcoded-app-creation-time";
import getAppEnvironment from "./get-app-environment";
import getAuthServerUrl from "./get-auth-server-url";
import getSchemaVaultsAuthApiDefinition from "./get-schemavaults-auth-api-definition";
import SCHEMAVAULTS_AUTH_APP_ID from "./SCHEMAVAULTS_AUTH_APP_ID";

export const HARDCODED_API_SERVER_IDS = [
  SCHEMAVAULTS_AUTH_APP_ID,
] as const satisfies readonly ApiServerId[];

export type HardcodedApiServerId = (typeof HARDCODED_API_SERVER_IDS)[number];

const HARDCODED_API_SERVER_ID_SET = new Set<string>(HARDCODED_API_SERVER_IDS);

/**
 * @description Builds the hardcoded API server definitions fresh on each call
 * so env-var-driven fields (owner organization, name, description) are
 * resolved at call time rather than module load.
 */
export function getHardcodedSchemaVaultsApis(): readonly SchemaVaultsApiServerDefinition[] {
  return [getSchemaVaultsAuthApiDefinition()];
}

export function isHardcodedApiServerId(
  api_server_id: ApiServerId,
): api_server_id is HardcodedApiServerId {
  if (!isValidApiServerId(api_server_id)) {
    throw new TypeError("Invalid API server ID to check if it is hardcoded!");
  }
  return HARDCODED_API_SERVER_ID_SET.has(api_server_id);
}

export function getHardcodedApiServer(
  hardcoded_api_server_id: HardcodedApiServerId,
): SchemaVaultsApiServerDefinition {
  const api = getHardcodedSchemaVaultsApis().find(
    (api) => api.api_server_id === hardcoded_api_server_id,
  );
  if (!api) {
    throw new Error(
      "No hardcoded API found with given 'hardcoded_api_server_id'!",
    );
  }
  return api;
}

export function getHardcodedApiDomains(
  hardcoded_app_id: HardcodedApiServerId,
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): readonly SchemaVaultsApiServerDomainRef[] {
  if (!isHardcodedApiServerId(hardcoded_app_id)) {
    throw new TypeError(
      "Failed to find hardcoded SchemaVault app definition for specified app ID",
      {
        cause: `'${hardcoded_app_id}' does not appear to be a hardcoded app ID!`,
      },
    );
  }

  const output: SchemaVaultsApiServerDomainRef[] = [];

  if (hardcoded_app_id === SCHEMAVAULTS_AUTH_APP_ID) {
    output.push({
      api_server_id: SCHEMAVAULTS_AUTH_APP_ID,
      environment,
      api_server_domain_ref_id: blankUuid,
      hardcoded: true,
      created_at: defaultHardcodedAppCreationTime,
      domain: getAuthServerUrl(environment),
    });
  }

  return output;
}
