import { AbstractJsonWebKeySetsStore, type IJsonWebKeySetsStore } from "@schemavaults/auth-server-sdk";
import { type JsonSerializedJwtKey, JWT_Keys, type I_JWT_Keys } from "@schemavaults/jwt";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { Kysely } from "@schemavaults/dbh";
import setupJwtKeysTable from "./setup_jwt_keys_table";
import { type JwtKeyRecord, isValidJwtKeyRecord } from "./jwt_keys_table";
import isValidUuid from "@/lib/is-valid-uuid";

export class AuthServerJwtKeysStore extends AbstractJsonWebKeySetsStore implements IJsonWebKeySetsStore{
  private readonly dbh: Kysely<AuthDatabase>;

  // Setup required database tables
  public async setup(): Promise<void> {
    await setupJwtKeysTable(this.dbh);
    return;
  }

  private parseJwtKeyRow(row: JwtKeyRecord): JwtKeyRecord {
    const withParsedExpiry = {
      ...row,
      keyset_expiry: typeof row.keyset_expiry === 'number' ? row.keyset_expiry : new Number(row.keyset_expiry).valueOf()
    }
    if (!isValidJwtKeyRecord(withParsedExpiry)) {
      throw new TypeError(`Invalid JWT key record from database: ${JSON.stringify(row)}`);
    }
    return withParsedExpiry;
  }

  private static initJwtKeysetInstanceFromSerializedKeys(keys: readonly JwtKeyRecord[]): JWT_Keys {
    if (keys.length !== 4) {
      throw new Error(`Expected 4 JWT keys, got ${keys.length}`);
    }

    const keyset_id: string = keys[0]!.keyset_id;
    if (!isValidUuid(keyset_id)) {
      throw new Error(`Invalid JWT keyset ID: ${keyset_id}`);
    }

    let keyset_expiry: number | undefined = undefined;;

    // Extract keys
    let verification: JsonSerializedJwtKey | undefined = undefined;
    let signing: JsonSerializedJwtKey | undefined = undefined;
    let encryption: JsonSerializedJwtKey | undefined = undefined;
    let decryption: JsonSerializedJwtKey | undefined = undefined;
    for (const key of keys) {
      if (key.keyset_id !== keyset_id) {
        throw new Error(`Keyset ID mismatch: ${key.keyset_id}`);
      }
      if (typeof keyset_expiry !== 'number') {
        keyset_expiry = key.keyset_expiry;
      }
      switch (key.key_type) {
        case 'verification':
          verification = key;
          break;
        case 'signing':
          signing = key;
          break;
        case 'encryption':
          encryption = key;
          break;
        case 'decryption':
          decryption = key;
          break;
      }
    }

    if (!verification || !signing || !encryption || !decryption) {
      throw new Error(`Missing JWT key type`);
    }

    if (typeof keyset_expiry !== 'number' || isNaN(keyset_expiry)) {
      throw new Error(`Invalid JWT keyset expiry`);
    }

    return new JWT_Keys({
      keyset_id,
      keyset_expiry,
      is_auth_server: true,
      verification,
      signing,
      encryption,
      decryption
    });
  }

  public async get(keySetId: string): Promise<I_JWT_Keys | null> {
    if (!isValidUuid(keySetId)) {
      throw new TypeError(`Invalid keyset ID to query for: '${keySetId}'`);
    }
    let rows: JwtKeyRecord[]
    try {
      const query = this.dbh.selectFrom('jwt_keys').where('keyset_id', '=', keySetId).selectAll();
      const result = await query.execute();
      rows = result.map(this.parseJwtKeyRow);
    } catch (error) {
      console.error(`Error querying JWT keys for keyset ID ${keySetId}:`, error);
      throw new Error(`Failed to query JWT keys for keyset ID '${keySetId}'`);
    }

    if (!rows.length) {
      return null;
    }

    if (rows.length !== 4) {
      throw new Error("Expected 4 JWT keys for keyset ID '" + keySetId + "', got " + rows.length);
    }

    if (!rows.every(row => row.keyset_id === keySetId)) {
      throw new Error(`JWT keys for keyset ID '${keySetId}' have inconsistent keyset IDs`);
    }


    return AuthServerJwtKeysStore.initJwtKeysetInstanceFromSerializedKeys(rows) satisfies I_JWT_Keys;
  }

  public async has(keySetId: string): Promise<boolean> {
    if (!isValidUuid(keySetId)) {
      throw new TypeError(`Invalid keyset ID to check existence for: '${keySetId}'`);
    }
    try {
      const query = this.dbh.selectFrom('jwt_keys').where('keyset_id', '=', keySetId).select('keyset_id')
      const result = await query.execute();
      if (result.length > 0) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error(`Error checking existence of JWT keys in keyset with ID ${keySetId}:`, error);
      throw new Error(`Failed to check existence of JWT keys for keyset ID '${keySetId}'`);
    }
  }

  public async storeKeySet(keys: I_JWT_Keys): Promise<void> {
    const keyset_expiry: number = keys.keyset_expiry;
    const serialized_keys: readonly JsonSerializedJwtKey[] = keys.listSerializedKeys();

    const rows = serialized_keys.map(key => ({ ...key, keyset_expiry }));
    await this.dbh.insertInto('jwt_keys').values(rows).execute();
  }

  public async delete(keySetId: string): Promise<void> {
    if (!isValidUuid(keySetId)) {
      throw new TypeError(`Invalid keyset ID to attempt deletion for: '${keySetId}'`);
    }
    try {
      await this.dbh.deleteFrom('jwt_keys').where('keyset_id', '=', keySetId).execute();
    } catch (e: unknown) {
      console.error(`Error deleting JWT keys for keyset with ID '${keySetId}':`, e);
      throw new Error(`Failed to delete keyset with ID: '${keySetId}'`);
    }
  }

  public async listActiveKeySets(currentTimestamp?: number): Promise<readonly I_JWT_Keys[]> {
    const now = typeof currentTimestamp === 'number' ? currentTimestamp : Date.now();

    let rows: JwtKeyRecord[]
    try {
      const query = this.dbh.selectFrom('jwt_keys').where('keyset_expiry', '>', now).selectAll();
      const result = await query.execute();
      rows = result.map(this.parseJwtKeyRow);
    } catch (e: unknown) {
      console.error(`Error listing active JWT keys:`, e);
      throw new Error(`Failed to list active JWT keys`);
    }

    // Split by keyset_id, assert that there are 4 keys in each keyset
    const keysets: Record<string, JwtKeyRecord[]> = rows.reduce((acc, row) => {
      const keyset = acc[row.keyset_id] || [];
      keyset.push(row);
      acc[row.keyset_id] = keyset;
      return acc;
    }, {} as Record<string, JwtKeyRecord[]>);

    return Object.values(keysets).map(AuthServerJwtKeysStore.initJwtKeysetInstanceFromSerializedKeys)
  }

  public async clearOutdatedKeySets(currentTimestamp?: number): Promise<void> {
    const now = typeof currentTimestamp === 'number' ? currentTimestamp : Date.now();
    try {
      await this.dbh.deleteFrom('jwt_keys').where('keyset_expiry', '<=', now).execute();
    } catch (e: unknown) {
      console.error(`Error clearing outdated JWT keys:`, e);
      throw new Error(`Failed to clear outdated JWT keys`);
    }
  }

  public constructor(dbh: Kysely<AuthDatabase>) {
    super();
    this.dbh = dbh;
  }
}

export default AuthServerJwtKeysStore;
