import { sql, type Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export async function setupJwtKeysTable(dbh: Kysely<AuthDatabase>): Promise<void> {
  const createJwtKeysTableSql = sql`
    CREATE TYPE IF NOT EXISTS jwt_keys_privacy_level_enum AS ENUM ('public', 'private');
    CREATE TYPE IF NOT EXISTS jwt_keys_storage_formats AS ENUM ('pem', 'base64url');
    CREATE TYPE IF NOT EXISTS jwt_keys_key_type AS ENUM ('encryption', 'decryption', 'signing', 'verification');
    CREATE TABLE IF NOT EXISTS JWT_KEYS (
      keyset_id UUID NOT NULL,
      keyset_expiry BIGINT NOT NULL,
      value TEXT NOT NULL,
      format jwt_keys_storage_formats NOT NULL,
      privacy_level jwt_keys_privacy_level_enum NOT NULL,
      key_type jwt_keys_key_type NOT NULL,
      PRIMARY KEY (keyset_id, key_type)
    );
  `;

  await createJwtKeysTableSql.execute(dbh);
}

export default setupJwtKeysTable;
