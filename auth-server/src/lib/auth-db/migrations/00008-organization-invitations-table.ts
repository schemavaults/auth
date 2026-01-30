// 00008-organization-invitations-table.ts
// Creates the organization_invitations table for managing organization membership invitations

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

async function createOrganizationInvitationsTable(db: Kysely<any>): Promise<void> {
  const createTableSql = sql`
    CREATE TABLE IF NOT EXISTS ORGANIZATION_INVITATIONS (
      invitation_id UUID PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES ORGANIZATIONS(organization_id) ON DELETE CASCADE,
      inviter_uid UUID NOT NULL REFERENCES USERS(uid) ON DELETE CASCADE,
      invitee_uid UUID NOT NULL REFERENCES USERS(uid) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked', 'expired')),
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      responded_at BIGINT
    );
  `;

  await createTableSql.execute(db);
}

async function createOrganizationInvitationsIndexes(db: Kysely<any>): Promise<void> {
  // Index for looking up invitations by organization
  const createOrgIndexSql = sql`
    CREATE INDEX IF NOT EXISTS idx_organization_invitations_org_id
    ON ORGANIZATION_INVITATIONS (organization_id);
  `;

  // Index for looking up invitations by invitee
  const createInviteeIndexSql = sql`
    CREATE INDEX IF NOT EXISTS idx_organization_invitations_invitee_uid
    ON ORGANIZATION_INVITATIONS (invitee_uid);
  `;

  // Index for looking up pending invitations (most common query)
  const createStatusIndexSql = sql`
    CREATE INDEX IF NOT EXISTS idx_organization_invitations_status
    ON ORGANIZATION_INVITATIONS (status) WHERE status = 'pending';
  `;

  // Unique constraint: only one pending invitation per org+invitee combination
  const createUniqueConstraintSql = sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_invitations_unique_pending
    ON ORGANIZATION_INVITATIONS (organization_id, invitee_uid) WHERE status = 'pending';
  `;

  await createOrgIndexSql.execute(db);
  await createInviteeIndexSql.execute(db);
  await createStatusIndexSql.execute(db);
  await createUniqueConstraintSql.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await createOrganizationInvitationsTable(db);
  await createOrganizationInvitationsIndexes(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("organization_invitations").execute();
}
