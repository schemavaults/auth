import {
  AbstractJsonWebKeySetsStore,
  type IJsonWebKeySetsStore,
} from "@schemavaults/auth-server-sdk";
import {
  type JsonSerializedJwtKey,
  JWT_Keys,
  type I_JWT_Keys,
} from "@schemavaults/jwt";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { Kysely } from "@schemavaults/dbh";
import setupJwtKeysTable from "./setup_jwt_keys_table";
import { type JwtKeyRecord, isValidJwtKeyRecord } from "./jwt_keys_table";
import isValidUuid from "@/lib/is-valid-uuid";
import type { IDatabaseResourceGroup } from "@schemavaults/auth-server-sdk";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import hasTableBeenInitialized from "@/lib/auth-db/hasTableBeenInitialized";

export class AuthServerJwtKeysStore
  extends AbstractJsonWebKeySetsStore
  implements IJsonWebKeySetsStore, IDatabaseResourceGroup
{
  private readonly dbh: Kysely<AuthDatabase>;

  private async hasSqlTableBeenInitialized(
    table_name: string,
  ): Promise<boolean> {
    return await hasTableBeenInitialized(this.dbh, table_name);
  }

  // Setup required database tables
  public async setup(): Promise<void> {
    await setupJwtKeysTable(this.dbh);
    return;
  }

  public async hasBeenInitialized(): Promise<boolean> {
    return await this.hasSqlTableBeenInitialized("jwt_keys");
  }

  public async performSetupTasks(): Promise<void> {
    await this.setup();
    return;
  }

  private parseJwtKeyRow(row: JwtKeyRecord): JwtKeyRecord {
    const withParsedExpiry = {
      ...row,
      keyset_expiry:
        typeof row.keyset_expiry === "number"
          ? row.keyset_expiry
          : new Number(row.keyset_expiry).valueOf(),
    };
    if (!isValidJwtKeyRecord(withParsedExpiry)) {
      throw new TypeError(
        `Invalid JWT key record from database: ${JSON.stringify(row)}`,
      );
    }
    return withParsedExpiry;
  }

  private static initJwtKeysetInstanceFromSerializedKeys(
    keys: readonly JwtKeyRecord[],
  ): JWT_Keys {
    if (keys.length !== 4) {
      throw new Error(`Expected 4 JWT keys, got ${keys.length}`);
    }

    if (new Set(keys.map((k) => k.audience_id)).size !== keys.length) {
      throw new Error(`Expected all JWT keys to have the same audience ID`);
    }
    const parsedApiServerId = apiServerIdSchema.safeParse(keys[0]?.audience_id);
    if (!parsedApiServerId.success) {
      console.error(parsedApiServerId.error);
      throw new Error(`Invalid API server ID`);
    }
    const audience_id: string = parsedApiServerId.data;

    if (new Set(keys.map((k) => k.keyset_id)).size !== keys.length) {
      throw new Error(`Expected all JWT keys to have the same keyset ID`);
    }
    const keyset_id: string = keys[0]!.keyset_id;
    if (!isValidUuid(keyset_id)) {
      throw new Error(`Invalid JWT keyset ID: ${keyset_id}`);
    }

    let keyset_expiry: number | undefined = undefined;

    // Extract keys
    let verification: JsonSerializedJwtKey | undefined = undefined;
    let signing: JsonSerializedJwtKey | undefined = undefined;
    let encryption: JsonSerializedJwtKey | undefined = undefined;
    let decryption: JsonSerializedJwtKey | undefined = undefined;
    for (const key of keys) {
      if (key.keyset_id !== keyset_id) {
        throw new Error(`Keyset ID mismatch: ${key.keyset_id}`);
      }
      if (typeof keyset_expiry !== "number") {
        keyset_expiry = key.keyset_expiry;
      }
      switch (key.key_type) {
        case "verification":
          verification = key;
          break;
        case "signing":
          signing = key;
          break;
        case "encryption":
          encryption = key;
          break;
        case "decryption":
          decryption = key;
          break;
      }
    }

    if (!verification || !signing || !encryption || !decryption) {
      throw new Error(`Missing JWT key type`);
    }

    if (typeof keyset_expiry !== "number" || isNaN(keyset_expiry)) {
      throw new Error(`Invalid JWT keyset expiry`);
    }

    return new JWT_Keys({
      audience_id,
      keyset_id,
      keyset_expiry,
      is_auth_server: true,
      verification,
      signing,
      encryption,
      decryption,
    });
  }

  public async get(keyset_id: string): Promise<I_JWT_Keys | null> {
    if (!isValidUuid(keyset_id)) {
      throw new TypeError(`Invalid keyset ID to query for: '${keyset_id}'`);
    }
    let rows: JwtKeyRecord[];
    try {
      const query = this.dbh
        .selectFrom("jwt_keys")
        .where("keyset_id", "=", keyset_id)
        .selectAll();
      const result = await query.execute();
      rows = result.map(this.parseJwtKeyRow);
    } catch (error) {
      console.error(
        `Error querying JWT keys for keyset ID ${keyset_id}:`,
        error,
      );
      throw new Error(`Failed to query JWT keys for keyset ID '${keyset_id}'`);
    }

    if (!rows.length) {
      return null;
    }

    if (rows.length !== 4) {
      throw new Error(
        "Expected 4 JWT keys for keyset ID '" +
          keyset_id +
          "', got " +
          rows.length,
      );
    }

    if (!rows.every((row) => row.keyset_id === keyset_id)) {
      throw new Error(
        `JWT keys for keyset ID '${keyset_id}' have inconsistent keyset IDs`,
      );
    }

    return AuthServerJwtKeysStore.initJwtKeysetInstanceFromSerializedKeys(
      rows,
    ) satisfies I_JWT_Keys;
  }

  public async has(keyset_id: string): Promise<boolean> {
    if (!isValidUuid(keyset_id)) {
      throw new TypeError(
        `Invalid keyset ID to check existence for: '${keyset_id}'`,
      );
    }
    try {
      const query = this.dbh
        .selectFrom("jwt_keys")
        .where("keyset_id", "=", keyset_id)
        .select("keyset_id");
      const result = await query.execute();
      if (result.length > 0) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error(
        `Error checking existence of JWT keys in keyset with ID ${keyset_id}:`,
        error,
      );
      throw new Error(
        `Failed to check existence of JWT keys for keyset ID '${keyset_id}'`,
      );
    }
  }

  public async storeKeySet(keys: I_JWT_Keys): Promise<void> {
    const keyset_expiry: number = keys.keyset_expiry;
    const serialized_keys: readonly JsonSerializedJwtKey[] =
      keys.listSerializedKeys();

    const rows = serialized_keys.map((key) => ({ ...key, keyset_expiry }));
    await this.dbh.insertInto("jwt_keys").values(rows).execute();
  }

  public async delete(audience_id: string, keyset_id: string): Promise<void> {
    if (!isValidUuid(keyset_id)) {
      throw new TypeError(
        `Invalid keyset ID to attempt deletion for: '${keyset_id}'`,
      );
    }
    try {
      await this.dbh
        .deleteFrom("jwt_keys")
        .where("keyset_id", "=", keyset_id)
        .execute();
    } catch (e: unknown) {
      console.error(
        `Error deleting JWT keys for keyset with ID '${keyset_id}':`,
        e,
      );
      throw new Error(`Failed to delete keyset with ID: '${keyset_id}'`);
    }
  }

  protected isValidApiServerId(val: unknown): val is ApiServerId {
    return apiServerIdSchema.safeParse(val).success;
  }

  public async listActiveKeySets(
    audience_id: string,
    currentTimestamp?: number,
  ): Promise<readonly I_JWT_Keys[]> {
    const now =
      typeof currentTimestamp === "number" ? currentTimestamp : Date.now();

    if (!this.isValidApiServerId(audience_id)) {
      throw new TypeError(
        `Invalid audience ID to list active keysets for: '${audience_id}'`,
      );
    }

    let rows: JwtKeyRecord[];
    try {
      const query = this.dbh
        .selectFrom("jwt_keys")
        .where("keyset_expiry", ">", now)
        .selectAll();
      const result = await query.execute();
      rows = result.map(this.parseJwtKeyRow);
    } catch (e: unknown) {
      console.error(`Error listing active JWT keys:`, e);
      throw new Error(`Failed to list active JWT keys`);
    }

    // Split by keyset_id, assert that there are 4 keys in each keyset
    const keysets: Record<string, JwtKeyRecord[]> = rows.reduce(
      (acc, row) => {
        const keyset = acc[row.keyset_id] || [];
        keyset.push(row);
        acc[row.keyset_id] = keyset;
        return acc;
      },
      {} as Record<string, JwtKeyRecord[]>,
    );

    return Object.values(keysets).map(
      AuthServerJwtKeysStore.initJwtKeysetInstanceFromSerializedKeys,
    );
  }

  public async clearOutdatedKeySets(currentTimestamp?: number): Promise<void> {
    const now =
      typeof currentTimestamp === "number" ? currentTimestamp : Date.now();
    try {
      await this.dbh
        .deleteFrom("jwt_keys")
        .where("keyset_expiry", "<=", now)
        .execute();
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
