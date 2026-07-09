import {
  type ApiServerId,
  apiServerIdSchema,
  getAuthServerAppId,
} from "@schemavaults/app-definitions";

export default function allowedOriginsEndpoint<T extends ApiServerId>(
  api_server_id: T,
): `/api/resource-server/apis/${T}/allowed-origins` {
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError(
      "Invalid 'api_server_id' to load allowed-origins endpoint URL for!",
    );
  }

  if (api_server_id === getAuthServerAppId()) {
    throw new TypeError(
      "The auth server does not load allowed origins via remote connection!",
    );
  }

  return `/api/resource-server/apis/${api_server_id}/allowed-origins`;
}
