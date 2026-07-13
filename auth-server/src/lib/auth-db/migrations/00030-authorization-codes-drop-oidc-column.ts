// 00030-authorization-codes-drop-oidc-column.ts
//
// Drops the AUTHORIZATION_CODES.oidc surface-discriminator column added
// by migration 00029. `scope` and `nonce` are now REQUIRED, first-class
// parameters of every login/register flow, so codes no longer belong to
// one surface: any code is redeemable at either token endpoint (the
// custom JSON endpoint or POST /api/oidc/token), each of which enforces
// its own PKCE + client + redirect_uri binding.
//
// Deploy-order safety: the insert path stopped writing this column in
// the same release, and the zod row schema keeps `oidc` as a deprecated
// optional key, so either order (migrate-then-deploy or
// deploy-then-migrate) parses cleanly. Pre-existing rows expire within
// 10 minutes (MAX_AUTHORIZATION_CODE_AGE) regardless.
import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    DROP COLUMN IF EXISTS oidc;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    ADD COLUMN IF NOT EXISTS oidc BOOLEAN NOT NULL DEFAULT FALSE;
  `.execute(db);
}
