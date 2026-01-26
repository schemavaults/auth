// 00003-baseline-apps-table.ts

import { sql, type Kysely } from "@schemavaults/dbh";

async function createAppAndAppDomainsTable(db: Kysely<any>): Promise<void> {
  const createAppSql = sql`
    CREATE TABLE IF NOT EXISTS APPS (
      app_id UUID PRIMARY KEY,
      app_name TEXT NOT NULL,
      app_description TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      hardcoded BOOLEAN DEFAULT FALSE,
      public BOOLEAN DEFAULT FALSE,
      owner_organization_id TEXT,
      CONSTRAINT fk_owner_org
        FOREIGN KEY (owner_organization_id)
        REFERENCES ORGANIZATIONS(organization_id)
        ON DELETE CASCADE
    );
  `;
  const createAppDomainsSql = sql`
    CREATE TABLE IF NOT EXISTS APP_DOMAINS (
      app_domain_ref_id UUID PRIMARY KEY,
      app_id UUID NOT NULL,
      domain TEXT NOT NULL,
      environment TEXT NOT NULL,
      created_at BIGINT NOT NULL,
      hardcoded BOOLEAN DEFAULT FALSE,
      CONSTRAINT fk_app FOREIGN KEY (app_id) REFERENCES APPS(app_id) ON DELETE CASCADE
    );
  `;
  await createAppSql.execute(db);
  await createAppDomainsSql.execute(db);
}

async function createAuthorizedAppsTable(db: Kysely<any>): Promise<void> {
  const createAuthorizedAppsTable = sql`
    CREATE TABLE IF NOT EXISTS AUTHORIZED_APPS (
      user_app_authorization_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      app_id UUID NOT NULL,
      uid UUID NOT NULL,
      authorized_at BIGINT NOT NULL CHECK (authorized_at > 0),
      CONSTRAINT fk_app FOREIGN KEY (app_id) REFERENCES apps(app_id) ON DELETE CASCADE,
      CONSTRAINT fk_user FOREIGN KEY (uid) REFERENCES users(uid) ON DELETE CASCADE,
      UNIQUE (app_id, uid)
    );
  `;
  await createAuthorizedAppsTable.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createAppAndAppDomainsTable(db);
  await createAuthorizedAppsTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('authorized_apps').execute()
  await db.schema.dropTable('app_domains').execute()
  await db.schema.dropTable('apps').execute()
}
