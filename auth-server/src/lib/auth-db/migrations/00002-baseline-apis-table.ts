// 00002-baseline-apis-table.ts

import { type Kysely, sql } from "@schemavaults/dbh";


async function createApiServersTableAndApiServerDomainsTable(db: Kysely<any>): Promise<void> {
  const createApiServersTable = sql`
    CREATE TABLE IF NOT EXISTS API_SERVERS (
      api_server_id UUID PRIMARY KEY,
      api_server_name TEXT NOT NULL,
      api_server_description TEXT NOT NULL,
      public BOOLEAN DEFAULT FALSE,
      created_at BIGINT NOT NULL,
      hardcoded BOOLEAN DEFAULT FALSE,
      owner_organization_id TEXT,
      CONSTRAINT fk_owner_org
        FOREIGN KEY (owner_organization_id)
        REFERENCES ORGANIZATIONS(organization_id)
        ON DELETE CASCADE
    );
  `;
  await createApiServersTable.execute(db);
  const createApiServerDomainsTable = sql`
    CREATE TABLE IF NOT EXISTS API_SERVER_DOMAINS (
      api_server_domain_ref_id UUID PRIMARY KEY,
      api_server_id UUID NOT NULL,
      domain TEXT NOT NULL,
      environment TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      hardcoded BOOLEAN DEFAULT FALSE,
      CONSTRAINT fk_api FOREIGN KEY (api_server_id) REFERENCES API_SERVERS(api_server_id) ON DELETE CASCADE
    );
  `;
  await createApiServerDomainsTable.execute(db);
}


export async function up(db: Kysely<any>): Promise<void> {
  await createApiServersTableAndApiServerDomainsTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('api_server_domains').execute();
  await db.schema.dropTable('api_servers').execute()
}
