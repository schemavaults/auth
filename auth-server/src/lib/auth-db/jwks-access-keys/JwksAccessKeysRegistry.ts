import { sql, type Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import AbstractDatabaseResourceGroup from "@/lib/auth-db/AbstractAuthServerDatabaseResourceGroup";
import type {
  JwksAccessKeyRecord,
  NewJwksAccessKeyRecord,
} from "./jwks-access-keys-table";
import { generateJwtSigningKeyPair } from "@schemavaults/jwt";

const DEFAULT_KEY_ALGORITHM = "RS256";

export class JwksAccessKeysRegistry extends AbstractDatabaseResourceGroup {
  public async hasBeenInitialized(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    const initialized = await this.hasTableBeenInitialized("jwks_access_keys");
    if (initialized) {
      this.initialized = true;
      return true;
    }

    return false;
  }

  public async performSetupTasks(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.setup();
    this.initialized = true;
  }

  private static async setupJwksAccessKeysSQLTable(
    db: Kysely<AuthDatabase>,
  ): Promise<void> {
    const createJwksAccessKeysTable = sql`
      CREATE TABLE IF NOT EXISTS JWKS_ACCESS_KEYS (
        key_id UUID PRIMARY KEY,
        api_server_id UUID NOT NULL,
        public_key TEXT NOT NULL,
        key_algorithm VARCHAR(16) NOT NULL DEFAULT 'RS256',
        created_at BIGINT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        CONSTRAINT fk_api_server
          FOREIGN KEY (api_server_id)
          REFERENCES API_SERVERS(api_server_id)
          ON DELETE CASCADE
      );
    `;
    await createJwksAccessKeysTable.execute(db);

    const createIndex = sql`
      CREATE INDEX IF NOT EXISTS idx_jwks_access_keys_api_server
        ON JWKS_ACCESS_KEYS(api_server_id) WHERE is_active = TRUE;
    `;
    await createIndex.execute(db);
  }

  protected async setup(): Promise<void> {
    await JwksAccessKeysRegistry.setupJwksAccessKeysSQLTable(this.db);
  }

  public constructor(protected db: Kysely<AuthDatabase>) {
    super(db);
  }

  /**
   * Get the active access key for a given API server audience
   */
  public async getActiveKeyForAudience(
    api_server_id: string,
  ): Promise<JwksAccessKeyRecord | null> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    const query = this.db
      .selectFrom("jwks_access_keys")
      .where("api_server_id", "=", api_server_id)
      .where("is_active", "=", true)
      .selectAll()
      .limit(1);

    const rows = await query.execute();
    if (rows.length === 0) {
      return null;
    }

    const row = rows[0]!;
    return {
      ...row,
      created_at:
        typeof row.created_at === "string"
          ? parseInt(row.created_at)
          : row.created_at,
    };
  }

  /**
   * Store a new JWKS access key
   */
  public async storeNewKey(record: NewJwksAccessKeyRecord): Promise<void> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    await this.db.insertInto("jwks_access_keys").values(record).execute();
  }

  /**
   * Deactivate all keys for a given API server
   */
  public async deactivateAllKeysForAudience(
    api_server_id: string,
  ): Promise<void> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    await this.db
      .updateTable("jwks_access_keys")
      .set({ is_active: false })
      .where("api_server_id", "=", api_server_id)
      .execute();
  }

  /**
   * Generate a new key pair for an API server
   * Returns the private key (one-time display) and stores the public key
   */
  public async generateNewKeyForAudience(
    api_server_id: string,
  ): Promise<{ privateKey: string; keyId: string }> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    const [privateKey, publicKey] = await generateJwtSigningKeyPair();
    const keyId = crypto.randomUUID();

    const newRecord: NewJwksAccessKeyRecord = {
      key_id: keyId,
      api_server_id,
      public_key: publicKey,
      key_algorithm: DEFAULT_KEY_ALGORITHM,
      created_at: Date.now(),
      is_active: true,
    };

    await this.storeNewKey(newRecord);

    return { privateKey, keyId };
  }

  /**
   * Regenerate key: deactivates all old keys and generates a new one
   * Returns the new private key (one-time display)
   */
  public async regenerateKey(
    api_server_id: string,
  ): Promise<{ privateKey: string; keyId: string }> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    await this.deactivateAllKeysForAudience(api_server_id);
    return await this.generateNewKeyForAudience(api_server_id);
  }

  /**
   * Get key metadata (without the actual key value)
   */
  public async getKeyMetadata(
    api_server_id: string,
  ): Promise<{ key_id: string; created_at: number; is_active: boolean } | null> {
    const key = await this.getActiveKeyForAudience(api_server_id);
    if (!key) {
      return null;
    }

    return {
      key_id: key.key_id,
      created_at:
        typeof key.created_at === "string"
          ? parseInt(key.created_at)
          : key.created_at,
      is_active: key.is_active,
    };
  }
}
