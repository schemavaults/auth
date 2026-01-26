// 00001-baseline-user-and-org-tables.ts
// SQL extracted out of user-registry.ts and organizations-registry.ts modules

import { sql, type Kysely } from "@schemavaults/dbh";

async function createOrganizationsTable(db: Kysely<any>): Promise<void> {
  const createOrganizationsTableSql = sql`
    CREATE TABLE IF NOT EXISTS ORGANIZATIONS (
      organization_id TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL,
      name TEXT NOT NULL,
      created_by UUID NOT NULL
    );
  `;

  await createOrganizationsTableSql.execute(db);
}

async function createInviteCodesTable(db: Kysely<any>): Promise<void> {
  const createInviteCodesTableSql = sql`
    CREATE TABLE IF NOT EXISTS INVITE_CODES (
      invite_code TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL,
      max_uses BIGINT NOT NULL,
      description TEXT,
      created_by UUID NOT NULL
    );
  `;

  await createInviteCodesTableSql.execute(db);
}

async function createUsersTable(db: Kysely<any>): Promise<void> {
  const createUsersTableQuery = sql`
    CREATE TABLE IF NOT EXISTS USERS (
      uid UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      email_verified BOOLEAN NOT NULL,
      created_at BIGINT NOT NULL CHECK (created_at > 0),
      invite_code TEXT,
      admin BOOLEAN DEFAULT FALSE,
      disabled BOOLEAN DEFAULT FALSE
    );
  `;
  await createUsersTableQuery.execute(db);
}

async function createPasswordsTable(db: Kysely<any>): Promise<void> {
  const createPasswordsTableQuery = sql`
    CREATE TABLE IF NOT EXISTS PASSWORDS (
      password_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      uid UUID NOT NULL,
      password TEXT NOT NULL,
      created_at BIGINT NOT NULL CHECK (created_at > 0),
      CONSTRAINT fk_user FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE
    );
  `;
  await createPasswordsTableQuery.execute(db);
}

async function createAuthorizationCodesTable(db: Kysely<any>): Promise<void> {
  const createAuthorizationCodesTableQuery = sql`
    CREATE TABLE IF NOT EXISTS AUTHORIZATION_CODES (
      authorization_code TEXT PRIMARY KEY,
      uid UUID NOT NULL,
      code_challenge TEXT NOT NULL,
      code_challenge_method VARCHAR(8) NOT NULL,
      challenge_time BIGINT NOT NULL CHECK (challenge_time > 0),
      created_at BIGINT NOT NULL CHECK (created_at > 0),
      CONSTRAINT fk_user FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE
    );
  `;
  await createAuthorizationCodesTableQuery.execute(db);
}

async function createOrganizationMembershipRolesTable(db: Kysely<any>): Promise<void> {
  const createOrganizationMembershipRolesTableSql = sql`
    CREATE TABLE IF NOT EXISTS ORGANIZATION_MEMBERSHIP_ROLES (
      membership_declaration_id UUID PRIMARY KEY,
      organization_id TEXT NOT NULL,
      uid UUID NOT NULL,
      created_at BIGINT NOT NULL,
      role TEXT NOT NULL,
      CONSTRAINT fk_user FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE,
      CONSTRAINT fk_org FOREIGN KEY (organization_id) REFERENCES ORGANIZATIONS(organization_id) ON DELETE CASCADE,
      UNIQUE (organization_id, uid, role)
    );
  `;
  await createOrganizationMembershipRolesTableSql.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createOrganizationsTable(db);
  await createInviteCodesTable(db);
  await createUsersTable(db);
  await Promise.all([
    createPasswordsTable(db),
    createAuthorizationCodesTable(db)
  ])
  await createOrganizationMembershipRolesTable(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('organization_membership_roles').execute();
  await Promise.all([
    db.schema.dropTable('organizations').execute(),
    db.schema.dropTable('invite_codes').execute()
  ]);
  await Promise.all([
    db.schema.dropTable('passwords').execute(),
    db.schema.dropTable('authorization_codes').execute()
  ]);
  await db.schema.dropTable('users').execute();
}
