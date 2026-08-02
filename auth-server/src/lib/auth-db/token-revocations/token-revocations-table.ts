import type { Insertable, Selectable } from "@schemavaults/dbh";

/**
 * Why a token was revoked. Rotation revocations ('rotation') are tolerated
 * for a short reuse grace window at the refresh grants; every other
 * revocation (NULL — logout, administrative) is immediate.
 */
export type TokenRevocationReason = "rotation";

export interface TokenRevocationsTable {
  jti: string;
  uid: string;
  expires_at: number;
  revoked_at: number;
  reason: TokenRevocationReason | null;
}

export type TokenRevocationRow = Selectable<TokenRevocationsTable>;
export type NewTokenRevocationRow = Insertable<TokenRevocationsTable>;
