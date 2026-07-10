import {
  type ApiServerId,
  apiServerIdSchema,
  getAuthServerAppId,
} from "@schemavaults/app-definitions";

export default function jwksEndpoint<T extends ApiServerId>(
  api_server_id: T,
): `/api/jwks/${T}` {
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError(
      "Invalid 'api_server_id' to load JWKS endpoint URL for!",
    );
  }

  if (api_server_id === getAuthServerAppId()) {
    throw new TypeError(
      "The auth server does not need to load JWKS via remote connection!",
    );
  }

  return `/api/jwks/${api_server_id}`;
}
