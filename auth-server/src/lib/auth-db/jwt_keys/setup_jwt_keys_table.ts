import { sql, type Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function setupJwtKeysTable(
  dbh: Kysely<AuthDatabase>,
): Promise<void> {
  const createJwtKeysTableSql = sql`
    CREATE TABLE IF NOT EXISTS JWT_KEYS (
      audience_id TEXT NOT NULL,
      keyset_id UUID NOT NULL,
      keyset_expiry BIGINT NOT NULL,
      value TEXT NOT NULL,
      format VARCHAR(16) NOT NULL,
      privacy_level VARCHAR(16) NOT NULL,
      key_type VARCHAR(16) NOT NULL,
      PRIMARY KEY (audience_id, keyset_id, key_type)
    );
  `;

  await createJwtKeysTableSql.execute(dbh);
}

export default setupJwtKeysTable;
