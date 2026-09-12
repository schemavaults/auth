// 00037-app-and-api-ownership-columns.ts
//
// Explicit ownership model for client application and API server
// declarations. Until now a NULL APPS/API_SERVERS.owner_organization_id was
// the (only) signal that a row was platform-owned, which left no room for
// declarations that belong to a single user account rather than to an
// organization — the ownership mode dynamic client registration needs.
//
// Each of APPS and API_SERVERS gains:
//   - owner_type TEXT NOT NULL: 'platform' | 'organization' | 'user'. The
//     discriminant that replaces the NULL-means-platform convention.
//   - owner_uid UUID: the owning user for owner_type = 'user'
//     (ON DELETE CASCADE, mirroring fk_owner_org — a user's declarations go
//     with the account, so a single DELETE FROM USERS still cleans up).
//   - created_by UUID: who created the row (audit only, ON DELETE SET NULL).
//
// Existing rows are backfilled from the legacy convention: NULL owner
// organization → 'platform', otherwise 'organization'. Platform rows keep a
// NULL owner_organization_id so that changing the configured owner
// organization still re-homes them automatically.
//
// A CHECK constraint keeps the discriminant and the owner id columns
// consistent so that exactly one owner is ever recorded per row.

import type { Kysely } from "@schemavaults/dbh";
import { sql } from "@/sql";

const TABLES = ["APPS", "API_SERVERS"] as const;

function constraintNames(table: (typeof TABLES)[number]) {
  const prefix = table.toLowerCase();
  return {
    fk_owner_uid: `fk_${prefix}_owner_uid`,
    fk_created_by: `fk_${prefix}_created_by`,
    chk_owner_type: `chk_${prefix}_owner_type`,
    chk_owner_consistency: `chk_${prefix}_owner_consistency`,
    idx_owner_uid: `${prefix}_owner_uid_idx`,
  } as const;
}

async function addOwnershipColumns(
  db: Kysely<any>,
  table: (typeof TABLES)[number],
): Promise<void> {
  const names = constraintNames(table);

  await sql`
    ALTER TABLE ${sql.raw(table)}
      ADD COLUMN IF NOT EXISTS owner_type TEXT,
      ADD COLUMN IF NOT EXISTS owner_uid UUID,
      ADD COLUMN IF NOT EXISTS created_by UUID;
  `.execute(db);

  // Backfill from the legacy NULL-means-platform convention.
  await sql`
    UPDATE ${sql.raw(table)}
    SET owner_type = CASE
      WHEN owner_organization_id IS NULL THEN 'platform'
      ELSE 'organization'
    END
    WHERE owner_type IS NULL;
  `.execute(db);

  await sql`
    ALTER TABLE ${sql.raw(table)}
      ALTER COLUMN owner_type SET NOT NULL;
  `.execute(db);

  await sql`
    ALTER TABLE ${sql.raw(table)}
      DROP CONSTRAINT IF EXISTS ${sql.raw(names.fk_owner_uid)};
  `.execute(db);
  await sql`
    ALTER TABLE ${sql.raw(table)}
      ADD CONSTRAINT ${sql.raw(names.fk_owner_uid)}
      FOREIGN KEY (owner_uid) REFERENCES USERS(uid) ON DELETE CASCADE;
  `.execute(db);

  await sql`
    ALTER TABLE ${sql.raw(table)}
      DROP CONSTRAINT IF EXISTS ${sql.raw(names.fk_created_by)};
  `.execute(db);
  await sql`
    ALTER TABLE ${sql.raw(table)}
      ADD CONSTRAINT ${sql.raw(names.fk_created_by)}
      FOREIGN KEY (created_by) REFERENCES USERS(uid) ON DELETE SET NULL;
  `.execute(db);

  await sql`
    ALTER TABLE ${sql.raw(table)}
      DROP CONSTRAINT IF EXISTS ${sql.raw(names.chk_owner_type)};
  `.execute(db);
  await sql`
    ALTER TABLE ${sql.raw(table)}
      ADD CONSTRAINT ${sql.raw(names.chk_owner_type)}
      CHECK (owner_type IN ('platform', 'organization', 'user'));
  `.execute(db);

  await sql`
    ALTER TABLE ${sql.raw(table)}
      DROP CONSTRAINT IF EXISTS ${sql.raw(names.chk_owner_consistency)};
  `.execute(db);
  await sql`
    ALTER TABLE ${sql.raw(table)}
      ADD CONSTRAINT ${sql.raw(names.chk_owner_consistency)}
      CHECK (
        (owner_type = 'platform'
          AND owner_organization_id IS NULL
          AND owner_uid IS NULL)
        OR (owner_type = 'organization'
          AND owner_organization_id IS NOT NULL
          AND owner_uid IS NULL)
        OR (owner_type = 'user'
          AND owner_uid IS NOT NULL
          AND owner_organization_id IS NULL)
      );
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS ${sql.raw(names.idx_owner_uid)}
      ON ${sql.raw(table)} (owner_uid);
  `.execute(db);
}

async function dropOwnershipColumns(
  db: Kysely<any>,
  table: (typeof TABLES)[number],
): Promise<void> {
  const names = constraintNames(table);

  await sql`DROP INDEX IF EXISTS ${sql.raw(names.idx_owner_uid)};`.execute(db);

  await sql`
    ALTER TABLE ${sql.raw(table)}
      DROP CONSTRAINT IF EXISTS ${sql.raw(names.chk_owner_consistency)},
      DROP CONSTRAINT IF EXISTS ${sql.raw(names.chk_owner_type)},
      DROP CONSTRAINT IF EXISTS ${sql.raw(names.fk_created_by)},
      DROP CONSTRAINT IF EXISTS ${sql.raw(names.fk_owner_uid)};
  `.execute(db);

  // User-owned rows have no representation in the legacy model (a NULL
  // owner organization would silently re-label them as platform-owned), so
  // they are removed rather than re-homed.
  await sql`
    DELETE FROM ${sql.raw(table)} WHERE owner_type = 'user';
  `.execute(db);

  await sql`
    ALTER TABLE ${sql.raw(table)}
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS owner_uid,
      DROP COLUMN IF EXISTS owner_type;
  `.execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  for (const table of TABLES) {
    await addOwnershipColumns(db, table);
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  for (const table of [...TABLES].reverse()) {
    await dropOwnershipColumns(db, table);
  }
}
