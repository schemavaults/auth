import type { Insertable, Selectable } from "@schemavaults/dbh";

export interface TokenRevocationsTable {
  jti: string;
  uid: string;
  expires_at: number;
  revoked_at: number;
}

export type TokenRevocationRow = Selectable<TokenRevocationsTable>;
export type NewTokenRevocationRow = Insertable<TokenRevocationsTable>;
