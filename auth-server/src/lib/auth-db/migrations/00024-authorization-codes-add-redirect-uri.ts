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
// Existing rows are deleted rather than backfilled: authorization codes
// are ≤10 minutes ephemeral (see MAX_AUTHORIZATION_CODE_AGE /
// migration 00015) and cannot be associated with a redirect_uri
// retroactively. Any in-flight OAuth flow will simply need to be
// restarted. (Precedent: migration 00018, which added client_app_id.)
import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    ADD COLUMN IF NOT EXISTS redirect_uri TEXT;
  `.execute(db);

  // Existing rows cannot be associated with a redirect_uri retroactively;
  // drop them. They would have expired within 10 minutes anyway.
  await sql`
    DELETE FROM AUTHORIZATION_CODES
    WHERE redirect_uri IS NULL;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE AUTHORIZATION_CODES
    DROP COLUMN IF EXISTS redirect_uri;
  `.execute(db);
}
