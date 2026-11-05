import type { Insertable, Selectable } from "@schemavaults/dbh";

export type IssuedTokenType = "access" | "refresh";
/** The grants recorded as `grant_type` (`token_exchange`: RFC 8693, delegated tokens). */
export const ISSUED_TOKEN_GRANT_TYPES = [
  "refresh_token",
  "authorization_code",
  "client_credentials",
  "token_exchange",
] as const;
export type IssuedTokenGrantType = (typeof ISSUED_TOKEN_GRANT_TYPES)[number];

export interface IssuedTokensTable {
  jti: string;
  uid: string;
  token_type: IssuedTokenType;
  client_app_id: string;
  audience: string;
  grant_type: IssuedTokenGrantType;
  issued_at: number;
  expires_at: number;
  /**
   * For an access token: the jti of the refresh token minted in the same
   * grant (migration 00039), so logout can revoke a session's access
   * tokens precisely. NULL for refresh-token rows, for access tokens
   * minted without a refresh token (client_credentials), and for rows
   * recorded before the column existed.
   */
  refresh_jti: string | null;
}

export type IssuedTokenRow = Selectable<IssuedTokensTable>;
export type NewIssuedTokenRow = Insertable<IssuedTokensTable>;
