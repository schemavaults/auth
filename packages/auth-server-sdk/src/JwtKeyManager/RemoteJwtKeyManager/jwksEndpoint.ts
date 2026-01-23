import {
  type ApiServerId,
  apiServerIdSchema,
  SCHEMAVAULTS_AUTH_SERVER,
} from "@schemavaults/app-definitions";

export default function jwksEndpoint<T extends ApiServerId>(
  api_server_id: T,
): `/api/jwks/${T}` {
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError(
      "Invalid 'api_server_id' to load JWKS endpoint URL for!",
    );
  }

  if (api_server_id === SCHEMAVAULTS_AUTH_SERVER.api_server_id) {
    throw new Error("The auth server does not expose a JWKS endpoint.");
  }

  return `/api/jwks/${api_server_id}`;
}
