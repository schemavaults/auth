import type { ApiServerId } from "./api-server-id";
import type { AppId } from "./app-id";
import {
  type HardcodedApiServerId,
  isHardcodedApiServerId,
} from "./hardcoded-apis";
import { type HardcodedAppId, isHardcodedAppId } from "./hardcoded-apps";
import SCHEMAVAULTS_AUTH_APP_ID from "./SCHEMAVAULTS_AUTH_APP_ID";

// Map of hardcoded app IDs to their permitted hardcoded API server IDs
const HARDCODED_APP_TO_API_PERMISSIONS = {
  [SCHEMAVAULTS_AUTH_APP_ID]: [SCHEMAVAULTS_AUTH_APP_ID],
} as const satisfies Record<HardcodedAppId, readonly HardcodedApiServerId[]>;

/** Check if a hardcoded app has permission to access a specific API server */
export function hasHardcodedAppToApiPermission(
  client_app_id: AppId,
  api_server_id: ApiServerId,
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

  const allowedApisForClient = HARDCODED_APP_TO_API_PERMISSIONS[client_app_id];

  return allowedApisForClient.includes(api_server_id) ?? false;
}

/** Get all hardcoded API server IDs that a hardcoded app has permission to access */
export function getHardcodedApiServerIdsAllowedForHardcodedApp(
  client_app_id: HardcodedAppId,
): readonly HardcodedApiServerId[] {
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
): readonly HardcodedAppId[] {
  if (!isHardcodedApiServerId(api_server_id)) {
    throw new TypeError(
      "getHardcodedAppIdsForHardcodedApiServer received non-hardcoded API server ID!",
    );
  }

  const result: HardcodedAppId[] = [];
  for (const [appId, apiServerIds] of Object.entries(
    HARDCODED_APP_TO_API_PERMISSIONS,
  )) {
    if (apiServerIds.includes(api_server_id)) {
      result.push(appId satisfies string as HardcodedAppId);
    }
  }
  return result;
}
