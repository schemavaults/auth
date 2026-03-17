import {
  HardcodedAppId,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  SCHEMAVAULTS_WEB,
} from "./hardcoded-core-schemavaults-apps";
import { SCHEMAVAULTS_CLI } from "./hardcoded-core-schemavaults-apps";
import { SCHEMAVAULTS_MAIL_APP_DEFINITION } from "./hardcoded-core-schemavaults-apps";
import {
  SCHEMAVAULTS_REGISTRY_SERVER,
  SCHEMAVAULTS_MAIL_SERVER,
  isHardcodedApiServerId,
} from "./hardcoded-core-schemavaults-api-servers";
import { isHardcodedAppId } from "./hardcoded-core-schemavaults-apps";
import type { HardcodedApiServerId } from "./hardcoded-core-schemavaults-api-servers";

// Map of hardcoded app IDs to their permitted hardcoded API server IDs
const HARDCODED_APP_TO_API_PERMISSIONS: Record<
  HardcodedAppId,
  HardcodedApiServerId[]
> = {
  [SCHEMAVAULTS_WEB.app_id]: [
    SCHEMAVAULTS_REGISTRY_SERVER.api_server_id,
    SCHEMAVAULTS_MAIL_SERVER.api_server_id,
  ],
  [SCHEMAVAULTS_CLI.app_id]: [
    SCHEMAVAULTS_REGISTRY_SERVER.api_server_id,
    SCHEMAVAULTS_MAIL_SERVER.api_server_id,
  ],
  [SCHEMAVAULTS_MAIL_APP_DEFINITION.app_id]: [
    SCHEMAVAULTS_MAIL_SERVER.api_server_id,
  ],
  [SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id]: [],
};

/** Check if a hardcoded app has permission to access a specific API server */
export function hasHardcodedAppToApiPermission(
  client_app_id: HardcodedAppId,
  api_server_id: HardcodedApiServerId,
): boolean {
  if (!isHardcodedAppId(client_app_id)) {
    throw new TypeError(
      "hasHardcodedAppToApiPermission received non-hardcoded client app ID!",
    );
  } else if (!isHardcodedApiServerId(api_server_id)) {
    throw new TypeError(
      "hasHardcodedAppToApiPermission received non-hardcoded API server ID!",
    );
  }

  return (
    HARDCODED_APP_TO_API_PERMISSIONS[client_app_id].includes(
      api_server_id as HardcodedApiServerId,
    ) ?? false
  );
}

/** Get all hardcoded API server IDs that a hardcoded app has permission to access */
export function getHardcodedApiServerIdsForHardcodedApp(
  client_app_id: HardcodedAppId,
): HardcodedApiServerId[] {
  if (!isHardcodedAppId(client_app_id)) {
    throw new TypeError(
      "hasHardcodedAppToApiPermission received non-hardcoded client app ID!",
    );
  }

  return HARDCODED_APP_TO_API_PERMISSIONS[client_app_id] ?? [];
}

/** Get all hardcoded app IDs that have permission to access a specific hardcoded API server */
export function getHardcodedAppIdsForHardcodedApiServer(
  api_server_id: HardcodedApiServerId,
): HardcodedAppId[] {
  if (!isHardcodedApiServerId(api_server_id)) {
    throw new TypeError(
      "getHardcodedAppIdsForHardcodedApiServer received non-hardcoded API server ID!",
    );
  }

  const result: HardcodedAppId[] = [];
  for (const [appId, apiServerIds] of Object.entries(HARDCODED_APP_TO_API_PERMISSIONS)) {
    if (apiServerIds.includes(api_server_id)) {
      result.push(appId as HardcodedAppId);
    }
  }
  return result;
}
