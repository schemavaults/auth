import type { AppId } from "@schemavaults/app-definitions";

export function RefreshTokenCookieName(
  app_id: AppId,
): `refresh_token_${AppId}` {
  return `refresh_token_${app_id}`;
}

export function RefreshTokenExpiryCookieName(
  app_id: AppId,
): `refresh_token_expiry_${AppId}` {
  return `refresh_token_expiry_${app_id}`;
}
