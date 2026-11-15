// 00054-audit-events-table.ts
// Creates the AUDIT_EVENTS table: one row per security-relevant action
// (sign-ins, MFA changes, app authorizations, administrator actions on an
// account, organization membership / invitation / policy changes), written
// by recordAuditEvent() (lib/audit-log/record-audit-event.ts). Users read
// their own rows on /account/audit-log (GET /api/me/audit-log);
// organization owners read their organization's rows on
// /orgs/{organization_id}/audit-log
// (GET /api/organizations/{organization_id}/audit-log).
//
// - actor_uid is who did it (NULL: nobody signed in, e.g. a failed sign-in,
//   or the server itself, e.g. the MFA enforcement job). subject_uid is the
//   account the event is about, when there is one. A user's log lists the
//   rows naming them as either.
// - actor_email / subject_email are the addresses at the time, kept so an
//   organization's log still says who was involved once an account's
//   address changes or the account is deleted (both uids are then set to
//   NULL by their foreign keys).
// - organization_id puts the row in that organization's log. It is NOT a
//   foreign key: system organizations have no ORGANIZATIONS row.
//   Organization ids are chosen by users and can be claimed again after a
//   deletion, so a trigger detaches the rows of a deleted organization
//   (organization_id moves into details.organization_id): a later
//   organization of the same id never sees its predecessor's history.
// - client_app_id is NOT a foreign key either (hardcoded apps have no APPS
//   row, and the history outlives a deleted app).
// - ip_address / user_agent describe the request that caused the event.
// - Deleting a user deletes the rows that name nobody else (another
//   trigger): their sign-ins, their own security changes. Rows in an
//   organization's log, and rows that also name another account (who they
//   acted on, or who acted on them), are kept with the deleted uid set to
//   NULL and the address as it was.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS AUDIT_EVENTS (
      audit_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at BIGINT NOT NULL CHECK (created_at > 0),
      event_type TEXT NOT NULL,
      actor_uid UUID,
      actor_email TEXT,
      subject_uid UUID,
      subject_email TEXT,
      organization_id TEXT,
      client_app_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      details JSONB,
      CONSTRAINT fk_audit_events_actor_uid
        FOREIGN KEY (actor_uid) REFERENCES USERS(uid) ON DELETE SET NULL,
      CONSTRAINT fk_audit_events_subject_uid
        FOREIGN KEY (subject_uid) REFERENCES USERS(uid) ON DELETE SET NULL
    );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS audit_events_subject_uid_created_at_idx
    ON AUDIT_EVENTS (subject_uid, created_at DESC, audit_event_id DESC)
    WHERE subject_uid IS NOT NULL;
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS audit_events_actor_uid_created_at_idx
    ON AUDIT_EVENTS (actor_uid, created_at DESC, audit_event_id DESC)
    WHERE actor_uid IS NOT NULL;
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS audit_events_organization_id_created_at_idx
    ON AUDIT_EVENTS (organization_id, created_at DESC, audit_event_id DESC)
    WHERE organization_id IS NOT NULL;
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION detach_audit_events_of_deleted_organization() RETURNS trigger AS $$
    BEGIN
      UPDATE AUDIT_EVENTS
        SET details = COALESCE(details, '{}'::jsonb)
              || jsonb_build_object('organization_id', organization_id),
            organization_id = NULL
        WHERE organization_id = OLD.organization_id;
      -- Detached rows that name no remaining account appear in no log.
      DELETE FROM AUDIT_EVENTS
        WHERE organization_id IS NULL
          AND actor_uid IS NULL
          AND subject_uid IS NULL
          AND details ->> 'organization_id' = OLD.organization_id;
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    DROP TRIGGER IF EXISTS organizations_detach_audit_events ON ORGANIZATIONS;
  `.execute(db);

  await sql`
    CREATE TRIGGER organizations_detach_audit_events
    AFTER DELETE ON ORGANIZATIONS
    FOR EACH ROW EXECUTE FUNCTION detach_audit_events_of_deleted_organization();
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION delete_audit_events_of_deleted_user() RETURNS trigger AS $$
    BEGIN
      -- Rows outside any organization's log that name no other remaining
      -- account: nobody could read them any more.
      DELETE FROM AUDIT_EVENTS
        WHERE organization_id IS NULL
          AND (actor_uid = OLD.uid OR subject_uid = OLD.uid)
          AND (actor_uid IS NULL OR actor_uid = OLD.uid)
          AND (subject_uid IS NULL OR subject_uid = OLD.uid);
      RETURN OLD;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    DROP TRIGGER IF EXISTS users_delete_audit_events ON USERS;
  `.execute(db);

  await sql`
    CREATE TRIGGER users_delete_audit_events
    BEFORE DELETE ON USERS
    FOR EACH ROW EXECUTE FUNCTION delete_audit_events_of_deleted_user();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP TRIGGER IF EXISTS users_delete_audit_events ON USERS;
  `.execute(db);
  await sql`
    DROP FUNCTION IF EXISTS delete_audit_events_of_deleted_user();
  `.execute(db);
  await sql`
    DROP TRIGGER IF EXISTS organizations_detach_audit_events ON ORGANIZATIONS;
  `.execute(db);
  await sql`
    DROP FUNCTION IF EXISTS detach_audit_events_of_deleted_organization();
  `.execute(db);
  await db.schema.dropTable("audit_events").ifExists().execute();
}
