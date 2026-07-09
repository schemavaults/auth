import type { ApiServerId } from "./api-server-id";
import type { AppId } from "./app-id";
import getAuthServerAppId from "./get-auth-server-app-id";
import {
  type HardcodedApiServerId,
  isHardcodedApiServerId,
} from "./hardcoded-apis";
import { type HardcodedAppId, isHardcodedAppId } from "./hardcoded-apps";

/**
 * @description Builds the map of hardcoded app IDs to their permitted
 * hardcoded API server IDs fresh on each call so the env-var-driven auth
 * server app id is resolved at call time rather than module load.
 */
function getHardcodedAppToApiPermissions(): ReadonlyMap<
  HardcodedAppId,
  readonly HardcodedApiServerId[]
> {
  const auth_server_app_id = getAuthServerAppId();
  return new Map([[auth_server_app_id, [auth_server_app_id]]]);
}

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

  const allowedApisForClient =
    getHardcodedAppToApiPermissions().get(client_app_id);

  return allowedApisForClient?.includes(api_server_id) ?? false;
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

  return getHardcodedAppToApiPermissions().get(client_app_id) ?? [];
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
  for (const [appId, apiServerIds] of getHardcodedAppToApiPermissions()) {
    if (apiServerIds.includes(api_server_id)) {
      result.push(appId);
    }
  }
  return result;
}
