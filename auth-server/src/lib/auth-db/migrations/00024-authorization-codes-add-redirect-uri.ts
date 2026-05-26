// 00024-authorization-codes-add-redirect-uri.ts
//
// Closes an OAuth2 authorization-code interception window by persisting
// the `redirect_uri` chosen at issuance time on the authorization_codes
// row. The token endpoint then binds the redemption to the same
// `redirect_uri` (exact string equality), so a code minted for URI A
// cannot be redeemed by presenting URI B — even if both URIs share an
// allowlisted origin.
//
// Nullable: the auth server's own /account login flow (the auth server
// authenticating itself) has no third-party redirect_uri to bind. The
// row stores NULL in that case, and the redemption must also present
// NULL (or no `redirect_uri` at all) to match.
//
// Pre-migration rows are intentionally NOT deleted: NULL is now a
// legitimate, permanent value for this column (the account-page flow),
// so `WHERE redirect_uri IS NULL` cannot distinguish "stale" from
// "valid." The existing rows naturally expire within 10 minutes
// (MAX_AUTHORIZATION_CODE_AGE) and the post-migration redemption logic
// rejects them for any third-party redirect_uri presentation anyway —
// the stored NULL won't match a non-null presented value.
import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    ADD COLUMN IF NOT EXISTS redirect_uri TEXT;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    DROP COLUMN IF EXISTS redirect_uri;
  `.execute(db);
}
