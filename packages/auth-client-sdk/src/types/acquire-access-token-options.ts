import type { ApiServerId } from "@schemavaults/app-definitions";
import type { RefreshToken } from "@schemavaults/auth-common";

export interface IAcquireAccessTokenOptions {
  refresh_token?: RefreshToken;

  // The API server ID that the access token is for. The 'aud' claim of the returned JWT.
  audience: ApiServerId;

  // If true, don't attempt retrieve this access token from the token cache, if it exists.
  // Ensure this token comes directly from the auth server
  ensure_fresh?: boolean;

  // If true, don't store this token in the token cache after successfully retrieving the new token
  dont_cache?: boolean;
}

export type { IAcquireAccessTokenOptions as AcquireAccessTokenOptions };
