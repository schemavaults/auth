import type { ApiServerId } from "@schemavaults/app-definitions";

export function AccessTokenCookieName(
  api_server_id: ApiServerId,
): `access_token_${ApiServerId}` {
  return `access_token_${api_server_id}`;
}

export function AccessTokenExpiryCookieName(
  api_server_id: ApiServerId,
): `access_token_expiry_${ApiServerId}` {
  return `access_token_expiry_${api_server_id}`;
}
