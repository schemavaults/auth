// 00058-used-api-server-domain-ref-ids.ts
//
// An API server domain registration's `api_server_domain_ref_id` is chosen by
// the caller of `POST /api/apis/{api_server_id}/domains`, and until now a
// removed registration's id could be registered again, for another domain and
// another API server. Everything that names a registration by its id (the
// verify endpoint, an administrator attesting the domain they were shown, the
// UI's cached rows) could then act on a different registration than the one it
// meant: a DNS lookup started for the caller's own domain could finish by
// verifying the domain that took its id meanwhile. The verification writes are
// now conditional on the registration's domain and token as well
// (`markApiServerDomainVerified()`); from now on ids are never reused either.
//
// - USED_API_SERVER_DOMAIN_REF_IDS holds every ref id ever registered, and
//   is never deleted from: removing a domain (or its API server, whose domains
//   go with it through ON DELETE CASCADE) leaves its id used.
// - A BEFORE INSERT (or UPDATE OF api_server_domain_ref_id) trigger on
//   API_SERVER_DOMAINS claims the row's id there, so registering an id that
//   was ever used, live or removed, fails with a unique violation on
//   `used_api_server_domain_ref_ids_pkey` (`addApiServerDomain()` answers it
//   with a 409), whichever code path performs the insert. Claiming is an
//   insert into a primary key, so two concurrent registrations of one id
//   cannot both succeed even while a delete of it is in flight.
// - Existing rows' ids are backfilled as used.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS USED_API_SERVER_DOMAIN_REF_IDS (
      api_server_domain_ref_id UUID PRIMARY KEY,
      used_at BIGINT NOT NULL
    );
  `.execute(db);

  await sql`
    INSERT INTO USED_API_SERVER_DOMAIN_REF_IDS (api_server_domain_ref_id, used_at)
      SELECT api_server_domain_ref_id, created_at FROM API_SERVER_DOMAINS
      ON CONFLICT (api_server_domain_ref_id) DO NOTHING;
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION claim_api_server_domain_ref_id() RETURNS trigger AS $$
    BEGIN
      IF TG_OP = 'UPDATE'
        AND NEW.api_server_domain_ref_id = OLD.api_server_domain_ref_id THEN
        RETURN NEW;
      END IF;
      INSERT INTO USED_API_SERVER_DOMAIN_REF_IDS (api_server_domain_ref_id, used_at)
        VALUES (
          NEW.api_server_domain_ref_id,
          (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT
        );
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    DROP TRIGGER IF EXISTS api_server_domains_claim_ref_id ON API_SERVER_DOMAINS;
  `.execute(db);

  await sql`
    CREATE TRIGGER api_server_domains_claim_ref_id
    BEFORE INSERT OR UPDATE OF api_server_domain_ref_id ON API_SERVER_DOMAINS
    FOR EACH ROW EXECUTE FUNCTION claim_api_server_domain_ref_id();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP TRIGGER IF EXISTS api_server_domains_claim_ref_id ON API_SERVER_DOMAINS;
  `.execute(db);

  await sql`
    DROP FUNCTION IF EXISTS claim_api_server_domain_ref_id();
  `.execute(db);

  await sql`
    DROP TABLE IF EXISTS USED_API_SERVER_DOMAIN_REF_IDS;
  `.execute(db);
}
