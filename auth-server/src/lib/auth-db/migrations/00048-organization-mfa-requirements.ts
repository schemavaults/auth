// 00048-organization-mfa-requirements.ts
//
// Organizations can require their members to use multi-factor
// authentication.
//
// ORGANIZATION_MFA_REQUIREMENTS: one row per organization that requires MFA
// (no row = not required). Joining such an organization (accepting an
// invitation, a platform administrator's direct assignment) is refused to
// users without a verified MFA factor. Members who have none are given a
// grace period of `grace_period_days` days to enable it.
//
// ORGANIZATION_MFA_GRACE_PERIODS: one row per member of such an
// organization who has no verified factor, started when the requirement was
// turned on (reason 'requirement_enabled') or when the member later lost
// their last factor (reason 'mfa_removed'). `ends_at` is fixed when the row
// is created. Past it, a member who still has no factor no longer counts as
// a member (listUserOrganizationMemberships) and the enforcement job
// (`/api/admin/organizations/enforce-mfa-requirements`) removes the
// membership. Rows are cleared when the user enrolls a factor and go with the
// requirement (ON DELETE CASCADE): turning the requirement off ends every
// grace period of the organization. `notified_at` records the
// `organization-mfa-required` email, so the job retries failed sends.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS ORGANIZATION_MFA_REQUIREMENTS (
      organization_id TEXT PRIMARY KEY,
      grace_period_days INTEGER NOT NULL,
      required_since BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      updated_by UUID,
      CONSTRAINT fk_organization_mfa_requirement_organization
        FOREIGN KEY (organization_id) REFERENCES ORGANIZATIONS(organization_id) ON DELETE CASCADE,
      CONSTRAINT fk_organization_mfa_requirement_updated_by
        FOREIGN KEY (updated_by) REFERENCES USERS(uid) ON DELETE SET NULL,
      CONSTRAINT chk_organization_mfa_requirement_grace_period_days
        CHECK (grace_period_days BETWEEN 1 AND 90)
    );
  `.execute(db);

  await sql`
    CREATE TABLE IF NOT EXISTS ORGANIZATION_MFA_GRACE_PERIODS (
      organization_id TEXT NOT NULL,
      uid UUID NOT NULL,
      reason TEXT NOT NULL,
      started_at BIGINT NOT NULL,
      ends_at BIGINT NOT NULL,
      notified_at BIGINT,
      PRIMARY KEY (organization_id, uid),
      CONSTRAINT fk_organization_mfa_grace_period_requirement
        FOREIGN KEY (organization_id) REFERENCES ORGANIZATION_MFA_REQUIREMENTS(organization_id) ON DELETE CASCADE,
      CONSTRAINT fk_organization_mfa_grace_period_user
        FOREIGN KEY (uid) REFERENCES USERS(uid) ON DELETE CASCADE,
      CONSTRAINT chk_organization_mfa_grace_period_reason
        CHECK (reason IN ('requirement_enabled', 'mfa_removed'))
    );
  `.execute(db);

  // Membership listings look up a user's expired grace periods on every call.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_organization_mfa_grace_periods_uid
      ON ORGANIZATION_MFA_GRACE_PERIODS (uid);
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable("organization_mfa_grace_periods")
    .ifExists()
    .execute();
  await db.schema
    .dropTable("organization_mfa_requirements")
    .ifExists()
    .execute();
}
