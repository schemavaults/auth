// 00050-organization-mfa-removals.ts
//
// ORGANIZATION_MFA_REMOVALS: one row per member the organization MFA
// enforcement job (`/api/admin/organizations/enforce-mfa-requirements`,
// migration 00048) removed from an organization because their grace period
// ended without a verified MFA factor. Written in the transaction that
// deletes the membership, it keeps what the deletion loses: who was removed
// from which organization, with which role, and when. The daily admin
// report lists the removals of its window from here.
//
// Rows go with the user and the organization (ON DELETE CASCADE), like the
// rest of their records.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS ORGANIZATION_MFA_REMOVALS (
      removal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id TEXT NOT NULL,
      uid UUID NOT NULL,
      role TEXT NOT NULL,
      grace_period_reason TEXT NOT NULL,
      grace_period_ended_at BIGINT NOT NULL,
      removed_at BIGINT NOT NULL,
      CONSTRAINT fk_organization_mfa_removal_organization
        FOREIGN KEY (organization_id) REFERENCES ORGANIZATIONS(organization_id) ON DELETE CASCADE,
      CONSTRAINT fk_organization_mfa_removal_user
        FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE,
      CONSTRAINT chk_organization_mfa_removal_grace_period_reason
        CHECK (grace_period_reason IN ('requirement_enabled', 'mfa_removed'))
    );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_organization_mfa_removals_removed_at
      ON ORGANIZATION_MFA_REMOVALS (removed_at DESC);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable("organization_mfa_removals")
    .ifExists()
    .execute();
}
