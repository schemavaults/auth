// 00029-authorization-codes-add-oidc-columns.ts
//
// Adds the columns backing the parallel OIDC surface (GET /api/oidc/authorize
// + POST /api/oidc/token) to AUTHORIZATION_CODES:
//
//   - nonce: the OIDC Core §3.1.2.1 replay nonce the RP sent to the
//     authorize endpoint; echoed as an id_token claim at redemption.
//     Null for non-OIDC flows and OIDC requests that omitted it.
//   - scope: the granted OIDC scopes (space-delimited, RFC 6749 §3.3),
//     e.g. "openid email". Null for non-OIDC flows.
//   - oidc: discriminates which surface minted the code. OIDC codes are
//     redeemable only at /api/oidc/token and custom-surface codes only at
//     the legacy token routes, so a code can never cross surfaces.
//
// nonce/scope are front-channel values supplied by the RP itself, so
// persisting them on the (single-use, 10-minute) code row mirrors how
// `redirect_uri` is already carried (migration 00024). Pre-migration rows
// get oidc=false, which is correct: they were all minted by the custom
// surface, and they expire within MAX_AUTHORIZATION_CODE_AGE anyway.
import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    ADD COLUMN IF NOT EXISTS nonce TEXT,
    ADD COLUMN IF NOT EXISTS scope TEXT,
    ADD COLUMN IF NOT EXISTS oidc BOOLEAN NOT NULL DEFAULT FALSE;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    DROP COLUMN IF EXISTS nonce,
    DROP COLUMN IF EXISTS scope,
    DROP COLUMN IF EXISTS oidc;
  `.execute(db);
}
