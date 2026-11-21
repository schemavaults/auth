// 00057-api-server-domain-verification.ts
//
// API_SERVER_DOMAINS gains domain OWNERSHIP verification. RFC 8707 `resource`
// URLs resolve to an API server through its registered domains
// (`resolveResourceUrlToApiServer()`), and any signed-in user may create an
// API server and register any domain on it, so an unverified registration let
// one tenant claim another's origin: resource-URL resolution became ambiguous
// for the victim (every token request for it failed), or, registered first,
// resolved to the squatter's API server. From now on VERIFIED domains take
// precedence in resource-URL resolution: when one matches, unverified
// registrations are ignored. Unverified registrations only still resolve
// as a fallback while the `require_api_server_domain_verification` server
// setting is off (its default, so nothing breaks while owners verify their
// domains); with the setting on they never do.
//
// - verification_token TEXT NOT NULL: random per registration. Its owner
//   publishes it as a DNS TXT record (`_<app id>-domain-verification.<host>` =
//   `<app id>-domain-verification=<token>`, with the deployment's own app id,
//   e.g. `schemavaults-auth`; see `lib/api-server-domain-verification/`)
//   and asks the auth server to check it. Backfilled for existing rows.
// - verified_at BIGINT (epoch ms) + verification_method TEXT: set together
//   when the registration was verified, NULL while it is pending.
//   `dns_txt`: the TXT record was found; `administrator`: a platform
//   administrator attested it (hosts DNS cannot verify, e.g. localhost).
//
// Existing rows of PLATFORM-owned API servers are marked verified by
// `administrator`: only platform administrators can create such API servers
// or add domains to them, so their registrations were already attested by
// one. Every other existing row starts unverified, including any squatted
// one. They keep resolving as before while the setting above is off; their
// owners verify them before an administrator turns it on.
//
// The partial index serves the resolution query (verified rows of one
// environment whose domain starts with the resource URL's origin).

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE API_SERVER_DOMAINS
      ADD COLUMN IF NOT EXISTS verification_token TEXT,
      ADD COLUMN IF NOT EXISTS verified_at BIGINT,
      ADD COLUMN IF NOT EXISTS verification_method TEXT;
  `.execute(db);

  await sql`
    UPDATE API_SERVER_DOMAINS
      SET verification_token = replace(gen_random_uuid()::text, '-', '')
      WHERE verification_token IS NULL;
  `.execute(db);

  await sql`
    ALTER TABLE API_SERVER_DOMAINS
      ALTER COLUMN verification_token SET NOT NULL;
  `.execute(db);

  await sql`
    ALTER TABLE API_SERVER_DOMAINS
      DROP CONSTRAINT IF EXISTS api_server_domains_verification_method_check;
  `.execute(db);
  await sql`
    ALTER TABLE API_SERVER_DOMAINS
      ADD CONSTRAINT api_server_domains_verification_method_check
      CHECK (
        verification_method IS NULL
        OR verification_method IN ('dns_txt', 'administrator')
      );
  `.execute(db);

  await sql`
    ALTER TABLE API_SERVER_DOMAINS
      DROP CONSTRAINT IF EXISTS api_server_domains_verification_state_check;
  `.execute(db);
  await sql`
    ALTER TABLE API_SERVER_DOMAINS
      ADD CONSTRAINT api_server_domains_verification_state_check
      CHECK ((verified_at IS NULL) = (verification_method IS NULL));
  `.execute(db);

  await sql`
    UPDATE API_SERVER_DOMAINS AS d
      SET verified_at = ${Date.now()}, verification_method = 'administrator'
      FROM API_SERVERS AS s
      WHERE s.api_server_id = d.api_server_id
        AND s.owner_type = 'platform'
        AND d.verified_at IS NULL;
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_api_server_domains_verified_by_environment
      ON API_SERVER_DOMAINS (environment, domain text_pattern_ops)
      WHERE verified_at IS NOT NULL;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_api_server_domains_verified_by_environment;`.execute(db);
  await sql`
    ALTER TABLE API_SERVER_DOMAINS
      DROP CONSTRAINT IF EXISTS api_server_domains_verification_state_check,
      DROP CONSTRAINT IF EXISTS api_server_domains_verification_method_check,
      DROP COLUMN IF EXISTS verification_method,
      DROP COLUMN IF EXISTS verified_at,
      DROP COLUMN IF EXISTS verification_token;
  `.execute(db);
}
