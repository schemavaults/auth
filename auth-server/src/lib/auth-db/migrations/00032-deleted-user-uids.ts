// 00032-deleted-user-uids.ts
//
// Reserves the uid of every deleted user so it can never be assigned to a
// new user. Third-party resource servers may retain data keyed by uid
// after the user is deleted here; re-issuing that uid to a fresh account
// would silently hand the new owner the deleted user's data on those
// servers. UUIDv4 collisions are already astronomically unlikely — this
// is a hard guarantee for the deliberate-reuse case (caller-supplied
// uids, test seeds, manual inserts), not a probability tweak.
//
// Two pieces:
//   1. DELETED_USER_UIDS — a tombstone table holding only the uid and the
//      deletion timestamp (no email or other PII survives the delete).
//      deleteUser() inserts a row inside the same transaction that
//      removes the user.
//   2. A BEFORE INSERT (or UPDATE OF uid) trigger on USERS that rejects
//      any row whose uid is tombstoned, enforcing the reservation at the
//      database layer no matter which code path performs the insert.
//      createUser() additionally pre-checks the table to surface a
//      readable error before the trigger fires.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS DELETED_USER_UIDS (
      uid UUID PRIMARY KEY,
      deleted_at BIGINT NOT NULL CHECK (deleted_at > 0)
    );
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION prevent_deleted_uid_reuse() RETURNS trigger AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM DELETED_USER_UIDS WHERE uid = NEW.uid) THEN
        RAISE EXCEPTION 'uid "%" belonged to a deleted user and may not be reused!', NEW.uid;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`
    DROP TRIGGER IF EXISTS users_prevent_deleted_uid_reuse ON USERS;
  `.execute(db);

  await sql`
    CREATE TRIGGER users_prevent_deleted_uid_reuse
    BEFORE INSERT OR UPDATE OF uid ON USERS
    FOR EACH ROW EXECUTE FUNCTION prevent_deleted_uid_reuse();
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP TRIGGER IF EXISTS users_prevent_deleted_uid_reuse ON USERS;
  `.execute(db);

  await sql`
    DROP FUNCTION IF EXISTS prevent_deleted_uid_reuse();
  `.execute(db);

  await sql`
    DROP TABLE IF EXISTS DELETED_USER_UIDS;
  `.execute(db);
}
