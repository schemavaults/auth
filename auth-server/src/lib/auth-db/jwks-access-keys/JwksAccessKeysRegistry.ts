import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type {
  JwksAccessKeyRecord,
  NewJwksAccessKeyRecord,
} from "./jwks-access-keys-table";
import { generateJwtSigningKeyPair, sign_verify_alg } from "@schemavaults/jwt";
import { JwksAccessKeyStatusQueryResponse } from "./JwksAccessKeyStatusQueryResponse";
import { ApiServerId, apiServerIdSchema } from "@schemavaults/app-definitions";
import { isHardcodedApiServerId } from "@schemavaults/app-definitions";

const DEFAULT_KEY_ALGORITHM = sign_verify_alg;

import shouldEnableDebug from "@/lib/should-enable-debug";

export class JwksAccessKeysRegistry {
  private readonly debug: boolean;

  public constructor(protected readonly db: Kysely<AuthDatabase>, debug: boolean = shouldEnableDebug()) {
    this.debug = debug;
  }

  /**
   * Get the active access key for a given API server audience
   */
  private async getActiveKeyForAudienceFromDatabase(
    api_server_id: ApiServerId,
    table_name: 'jwks_access_keys' | 'jwks_access_keys_for_hardcoded'
  ): Promise<JwksAccessKeyRecord | null> {

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
    if (!apiServerIdSchema.safeParse(api_server_id).success) {
      throw new TypeError("Invalid API server ID to look up an active JWKS access key for!");
    }
    return await this.getActiveKeyForAudienceFromDatabase(api_server_id, 'jwks_access_keys');
  }

  /**
   * Store a new JWKS access key
   */
  public async storeNewKey(record: NewJwksAccessKeyRecord): Promise<void> {
    if (this.debug) {
      console.log(`[JwksAccessKeysRegistry] storeNewKey(${JSON.stringify(record)})`)
    }
    if (isHardcodedApiServerId(record.api_server_id)) {
      await this.db.insertInto("jwks_access_keys_for_hardcoded").values(record).execute();
      return;
    }
    if (!apiServerIdSchema.safeParse(record.api_server_id).success) {
      throw new TypeError("Invalid API server ID to store a new JWKS access key for!");
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
      if (!apiServerIdSchema.safeParse(api_server_id).success) {
        throw new TypeError("Invalid API server ID to deactivate JWKS access keys for!");
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
