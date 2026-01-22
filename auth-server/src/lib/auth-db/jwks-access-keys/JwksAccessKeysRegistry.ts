import { sql, type Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "../auth-database-types";
import AbstractDatabaseResourceGroup from "@/lib/auth-db/AbstractAuthServerDatabaseResourceGroup";
import type {
  JwksAccessKeyRecord,
  NewJwksAccessKeyRecord,
} from "./jwks-access-keys-table";
import { generateJwtSigningKeyPair, sign_verify_alg } from "@schemavaults/jwt";
import { JwksAccessKeyStatusQueryResponse } from "./JwksAccessKeyStatusQueryResponse";
import { ApiServerId } from "@schemavaults/app-definitions";
import isHardcodedApiServerId from "@/lib/isHardcodedApiServerId";

const DEFAULT_KEY_ALGORITHM = sign_verify_alg;

import isValidUuid from "@/lib/is-valid-uuid";
import shouldEnableDebug from "@/lib/should-enable-debug";

export class JwksAccessKeysRegistry extends AbstractDatabaseResourceGroup {
  private readonly debug: boolean;

  public constructor(protected db: Kysely<AuthDatabase>, debug: boolean = shouldEnableDebug()) {
    super(db);
    this.debug = debug;
  }

  public async hasBeenInitialized(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }

    const results = await Promise.all([
      this.hasTableBeenInitialized("jwks_access_keys") satisfies Promise<boolean>,
      this.hasTableBeenInitialized("jwks_access_keys_for_hardcoded") satisfies Promise<boolean>
    ]);
    if (results[0] && results[1]) {
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

    const createJwksAccessKeysForHardcodedTable = sql`
      CREATE TABLE IF NOT EXISTS JWKS_ACCESS_KEYS_FOR_HARDCODED (
        key_id UUID PRIMARY KEY,
        api_server_id TEXT NOT NULL,
        public_key TEXT NOT NULL,
        key_algorithm VARCHAR(16) NOT NULL DEFAULT 'RS256',
        created_at BIGINT NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      );
    `;
    await createJwksAccessKeysForHardcodedTable.execute(db);

    const createIndexForHardcoded = sql`
      CREATE INDEX IF NOT EXISTS idx_jwks_access_keys_for_hardcoded_api_server
        ON JWKS_ACCESS_KEYS_FOR_HARDCODED(api_server_id) WHERE is_active = TRUE;
    `;
    await createIndexForHardcoded.execute(db);
  }

  protected async setup(): Promise<void> {
    await JwksAccessKeysRegistry.setupJwksAccessKeysSQLTable(this.db);
  }

  /**
   * Get the active access key for a given API server audience
   */
  private async getActiveKeyForAudienceFromDatabase(
    api_server_id: ApiServerId,
    table_name: 'jwks_access_keys' | 'jwks_access_keys_for_hardcoded'
  ): Promise<JwksAccessKeyRecord | null> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (table_name !== 'jwks_access_keys' && table_name !== 'jwks_access_keys_for_hardcoded') {
      throw new TypeError("Invalid table name to load active key for!")
    }

    if (this.debug) {
      console.log(`[JwksAccessKeysRegistry] getActiveKeyForAudienceFromDatabase('${api_server_id}', '${table_name}')`)
    }

    const db = this.db;

    function fromDynamicApiServersJwksAccessKeySelectQuery() {
      return db.selectFrom('jwks_access_keys')
        .where("api_server_id", "=", api_server_id)
        .where("is_active", "=", true)
        .selectAll()
        .limit(1);
    }

    function fromHardcodedApiServersJwksAccessKeySelectQuery() {
      return db.selectFrom('jwks_access_keys_for_hardcoded')
        .where("api_server_id", "=", api_server_id)
        .where("is_active", "=", true)
        .selectAll()
        .limit(1);
    }

    const query = table_name === 'jwks_access_keys_for_hardcoded' ?
      fromHardcodedApiServersJwksAccessKeySelectQuery()
      : fromDynamicApiServersJwksAccessKeySelectQuery()


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

  public async getActiveKeyForAudience(api_server_id: ApiServerId): Promise<JwksAccessKeyRecord | null> {
    if (this.debug) {
      console.log(`[JwksAccessKeysRegistry] getActiveKeyForAudience('${api_server_id}')`)
    }
    if (isHardcodedApiServerId(api_server_id)) {
      return await this.getActiveKeyForAudienceFromDatabase(api_server_id, 'jwks_access_keys_for_hardcoded')
    }
    if (!isValidUuid(api_server_id)) {
      throw new TypeError("Expected API server ID to be a valid UUID if not determined to be a hardcoded app ID!");
    }
    return await this.getActiveKeyForAudienceFromDatabase(api_server_id, 'jwks_access_keys');
  }

  /**
   * Store a new JWKS access key
   */
  public async storeNewKey(record: NewJwksAccessKeyRecord): Promise<void> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }
    if (this.debug) {
      console.log(`[JwksAccessKeysRegistry] storeNewKey(${JSON.stringify(record)})`)
    }
    if (isHardcodedApiServerId(record.api_server_id)) {
      await this.db.insertInto("jwks_access_keys_for_hardcoded").values(record).execute();
      return;
    }
    if (!isValidUuid(record.api_server_id)) {
      throw new TypeError("Expected API server ID to be a valid UUID if not determined to be a hardcoded app ID!");
    }
    await this.db.insertInto("jwks_access_keys").values(record).execute();
    return;
  }

  /**
   * Deactivate all keys for a given API server
   */
  public async deactivateAllKeysForAudience(
    api_server_id: ApiServerId,
  ): Promise<void> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (this.debug) {
      console.log(`[JwksAccessKeysRegistry] deactivateAllKeysForAudience('${api_server_id}')`)
    }
    if (isHardcodedApiServerId(api_server_id)) {
      await this.db
        .updateTable("jwks_access_keys_for_hardcoded")
        .set({ is_active: false })
        .where("api_server_id", "=", api_server_id)
        .execute();
      return;
    } else {
      if (!isValidUuid(api_server_id)) {
        throw new TypeError("Expected API server ID to be a valid UUID if not determined to be a hardcoded app ID!");
      }
      await this.db
        .updateTable("jwks_access_keys")
        .set({ is_active: false })
        .where("api_server_id", "=", api_server_id)
        .execute();
      return;
    }
  }

  /**
   * Generate a new key pair for an API server
   * Returns the private key (one-time display) and stores the public key
   */
  public async generateNewKeyForAudience(
    api_server_id: ApiServerId,
  ): Promise<{ privateKey: string; keyId: string }> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (this.debug) {
      console.log(`[JwksAccessKeysRegistry] generateNewKeyForAudience('${api_server_id}')`)
    }

    const [privateKey, publicKey] = await generateJwtSigningKeyPair();
    const keyId: string = crypto.randomUUID();

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
    api_server_id: ApiServerId,
  ): Promise<{ privateKey: string; keyId: string }> {
    if (!(await this.hasBeenInitialized())) {
      await this.performSetupTasks();
    }

    if (this.debug) {
      console.log(`[JwksAccessKeysRegistry] regenerateKey('${api_server_id}')`)
    }

    return await this.db.transaction().execute(async () => {
      await this.deactivateAllKeysForAudience(api_server_id);
      return await this.generateNewKeyForAudience(api_server_id);
    })
  }

  /**
   * Get key metadata (without the actual key value)
   */
  public async getKeyMetadata(
    api_server_id: ApiServerId,
  ): Promise<JwksAccessKeyStatusQueryResponse | null> {
    if (this.debug) {
      console.log(`[JwksAccessKeysRegistry] getKeyMetadata('${api_server_id}')`)
    }

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
    } satisfies JwksAccessKeyStatusQueryResponse;
  }
}

export default JwksAccessKeysRegistry;
