// 00045-api-server-organization-membership-visibility.ts
//
// API_SERVERS gains organization_membership_visibility TEXT NOT NULL
// DEFAULT 'owning_organization' ('owning_organization' | 'all_organizations'):
// which organizations' memberships the API server may look up on the
// resource-server endpoints (`.../members/{uid}/role` and
// `/api/resource-server/users/{uid}/organizations`).
//
// - 'owning_organization' (every existing row): only the organization that
//   owns the API server, the rule the role endpoint always applied.
// - 'all_organizations': any organization, for multi-tenant platform
//   services such as the schema registry. Only platform administrators set
//   it (`PUT /api/apis/{api_server_id}/organization-membership-visibility`),
//   and lookups outside the owning organization must present the user's
//   access token for the API server (`X-Subject-Token`).

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE API_SERVERS
      ADD COLUMN IF NOT EXISTS organization_membership_visibility TEXT NOT NULL DEFAULT 'owning_organization';
  `.execute(db);

  await sql`
    ALTER TABLE API_SERVERS
      DROP CONSTRAINT IF EXISTS chk_api_servers_organization_membership_visibility;
  `.execute(db);
  await sql`
    ALTER TABLE API_SERVERS
      ADD CONSTRAINT chk_api_servers_organization_membership_visibility
      CHECK (organization_membership_visibility IN ('owning_organization', 'all_organizations'));
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE API_SERVERS
      DROP CONSTRAINT IF EXISTS chk_api_servers_organization_membership_visibility;
  `.execute(db);
  await sql`
    ALTER TABLE API_SERVERS
      DROP COLUMN IF EXISTS organization_membership_visibility;
  `.execute(db);
}
