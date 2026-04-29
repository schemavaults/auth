import type { Insertable, Selectable } from "@schemavaults/dbh";

export type IssuedTokenType = "access" | "refresh";
export type IssuedTokenGrantType = "refresh_token" | "authorization_code";

export interface IssuedTokensTable {
  jti: string;
  uid: string;
  token_type: IssuedTokenType;
  client_app_id: string;
  audience: string;
  grant_type: IssuedTokenGrantType;
  issued_at: number;
  expires_at: number;
}

export type IssuedTokenRow = Selectable<IssuedTokensTable>;
export type NewIssuedTokenRow = Insertable<IssuedTokensTable>;
