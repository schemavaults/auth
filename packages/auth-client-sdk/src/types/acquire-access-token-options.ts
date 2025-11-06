import type { RefreshToken } from "@schemavaults/auth-common";

export type AcquireAccessTokenOptions = {
  refresh_token?: RefreshToken;

  // An id to cache this token as (probably should be the audience attribute of the token, e.g. API server UUID)
  token_id: string;

  audience: string;

  // If true, don't attempt retrieve this access token from the token cache, if it exists.
  // Ensure this token comes directly from the auth server
  ensure_fresh?: boolean;

  // If true, don't store this token in the token cache after successfully retrieving the new token
  dont_cache?: boolean;
};
