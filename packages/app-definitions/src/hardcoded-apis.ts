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
import getAuthServerAppId from "./get-auth-server-app-id";
import getSchemaVaultsAuthApiDefinition from "./get-schemavaults-auth-api-definition";
import getOidcUserinfoApiDefinition from "./get-oidc-userinfo-api-definition";
import { OIDC_USERINFO_AUDIENCE_ID } from "./oidc-userinfo-audience";

export type HardcodedApiServerId = ApiServerId;

/**
 * @description Resolves the IDs of the hardcoded API server definitions fresh
 * on each call so the env-var-driven auth server app id is resolved at call
 * time rather than module load.
 */
export function getHardcodedApiServerIds(): readonly HardcodedApiServerId[] {
  return [getAuthServerAppId(), OIDC_USERINFO_AUDIENCE_ID];
}

/**
 * @description Builds the hardcoded API server definitions fresh on each call
 * so env-var-driven fields (API server id, owner organization, name,
 * description) are resolved at call time rather than module load.
 */
export function getHardcodedSchemaVaultsApis(): readonly SchemaVaultsApiServerDefinition[] {
  return [getSchemaVaultsAuthApiDefinition(), getOidcUserinfoApiDefinition()];
}

export function isHardcodedApiServerId(
  api_server_id: ApiServerId,
): api_server_id is HardcodedApiServerId {
  if (!isValidApiServerId(api_server_id)) {
    throw new TypeError("Invalid API server ID to check if it is hardcoded!");
  }
  return getHardcodedApiServerIds().includes(api_server_id);
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

  const auth_server_app_id = getAuthServerAppId();
  if (hardcoded_app_id === auth_server_app_id) {
    output.push({
      api_server_id: auth_server_app_id,
      environment,
      api_server_domain_ref_id: blankUuid,
      hardcoded: true,
      created_at: defaultHardcodedAppCreationTime,
      domain: getAuthServerUrl(environment),
    });
  }

  // The OIDC userinfo audience is served by the auth server itself
  // (GET/POST /api/oidc/userinfo), so it lives on the auth server's domain.
  if (hardcoded_app_id === OIDC_USERINFO_AUDIENCE_ID) {
    output.push({
      api_server_id: OIDC_USERINFO_AUDIENCE_ID,
      environment,
      api_server_domain_ref_id: blankUuid,
      hardcoded: true,
      created_at: defaultHardcodedAppCreationTime,
      domain: getAuthServerUrl(environment),
    });
  }

  return output;
}
