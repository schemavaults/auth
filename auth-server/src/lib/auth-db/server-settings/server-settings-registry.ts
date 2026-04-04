import "server-only";

import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { ServerSettingRow } from "./server-settings-table";
import type { ServerSettingRecord } from "./types";
import {
  type ServerSettingKey,
  type ServerSettingValueTypes,
  getDefaultValue,
  getSettingSchema,
  getSettingValueType,
  isValidServerSettingKey,
  getAllSettingKeys,
  SERVER_SETTING_DEFINITIONS,
} from "./server-setting-keys";
import type Redis from "ioredis";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

interface RedisCachePayload {
  /** Serialized setting value (same format as DB's setting_value column) */
  v: string;
  /** Value type (same as DB's value_type column) */
  t: string;
}

/**
 * Registry for managing server settings in the database.
 * Provides type-safe access to settings with caching and validation.
 */
export class ServerSettingsRegistry {
  private readonly cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly cacheTtlMs: number;

  constructor(
    private readonly db: Kysely<AuthDatabase>,
    cacheTtlMs: number = 60_000, // 1 minute default
    private readonly redis?: Redis
  ) {
    this.cacheTtlMs = cacheTtlMs;
  }

  private redisKey(key: string): string {
    return `server_setting:${key}`;
  }

  private get redisTtlSeconds(): number {
    return Math.ceil(this.cacheTtlMs / 1000);
  }

  private async readLatestSettingRow<K extends ServerSettingKey>(
    key: K
  ): Promise<ServerSettingRow | undefined> {
    let row: ServerSettingRow | undefined;
    try {
      const query = this.db
        .selectFrom("server_settings")
        .where("setting_key", "=", key)
        .orderBy('created_at', 'desc')
        .selectAll()
        .limit(1)

      row = await
        query.executeTakeFirst();
    } catch (e: unknown) {
      console.error(
        `[ServerSettingsRegistry] Failed to query setting "${key}":`,
        e
      );
      throw new Error(`Error attempting to query server setting with key '${key}'`)
    }
    return row;
  }

  private async readLatestSettingValue<K extends ServerSettingKey>(
    key: K
  ): Promise<ServerSettingValueTypes[K] | undefined> {
    const row = await this.readLatestSettingRow<K>(key);
    if (!row) return undefined;
    return this.parseStoredValue(key, row.setting_value);
  }

  /**
   * Get a setting value with type safety and caching.
   * Checks in-memory cache, then Redis, then database.
   * Returns the default value if the setting is not found.
   */
  public async getSetting<K extends ServerSettingKey>(
    key: K
  ): Promise<ServerSettingValueTypes[K]> {
    // Check in-memory cache first (fast path for repeated reads within same request)
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as ServerSettingValueTypes[K];
    }

    // Check Redis cache
    if (this.redis) {
      try {
        const redisValue = await this.redis.get(this.redisKey(key));
        if (redisValue !== null) {
          const payload: RedisCachePayload = JSON.parse(redisValue);
          const parsed = this.parseStoredValue(key, payload.v);
          this.setCacheEntry(key, parsed);
          return parsed;
        }
      } catch (e: unknown) {
        console.error(
          `[ServerSettingsRegistry] Redis cache read failed for "${key}", falling back to database:`,
          e
        );
      }
    }

    // Query database
    const row = await this.readLatestSettingRow(key);
    if (!row) {
      // Setting not in database, return the default
      return getDefaultValue(key);
    }

    const value = this.parseStoredValue(key, row.setting_value);
    this.setCacheEntry(key, value);

    // Populate Redis cache for subsequent requests
    if (this.redis) {
      try {
        const payload: RedisCachePayload = { v: row.setting_value, t: row.value_type };
        await this.redis.set(
          this.redisKey(key),
          JSON.stringify(payload),
          "EX",
          this.redisTtlSeconds
        );
      } catch (e: unknown) {
        console.error(
          `[ServerSettingsRegistry] Failed to populate Redis cache for "${key}":`,
          e
        );
      }
    }

    return value satisfies ServerSettingValueTypes[K];
  }

  /**
   * Set a setting value with validation.
   * Uses upsert to create or update the setting.
   */
  public async setSetting<K extends ServerSettingKey>(
    key: K,
    value: ServerSettingValueTypes[K],
    updatedBy?: string,
    description?: string
  ): Promise<void> {
    // Validate the value against the schema
    const schema = getSettingSchema(key);
    const parseResult = schema.safeParse(value);
    if (!parseResult.success) {
      throw new Error(
        `Invalid value for setting "${key}": ${parseResult.error.message}`
      );
    }

    const valueType = getSettingValueType(key);
    const storedValue = this.serializeValue(value, valueType);
    const now = Date.now();

    try {
      // Use upsert pattern for insert or update
      await this.db
        .insertInto("server_settings")
        .values({
          setting_key: key,
          setting_value: storedValue,
          value_type: valueType,
          description: description ?? SERVER_SETTING_DEFINITIONS[key].description,
          created_at: now,
          updated_at: now,
          updated_by: updatedBy ?? null,
        })
        .onConflict((oc) =>
          oc.column("setting_key").doUpdateSet({
            setting_value: storedValue,
            value_type: valueType,
            description: description ?? undefined,
            updated_at: now,
            updated_by: updatedBy ?? null,
          })
        )
        .execute();

      // Update in-memory cache
      this.setCacheEntry(key, value);

      // Push to Redis cache
      if (this.redis) {
        try {
          const payload: RedisCachePayload = { v: storedValue, t: valueType };
          await this.redis.set(
            this.redisKey(key),
            JSON.stringify(payload),
            "EX",
            this.redisTtlSeconds
          );
        } catch (redisError: unknown) {
          console.error(
            `[ServerSettingsRegistry] Failed to update Redis cache for "${key}":`,
            redisError
          );
        }
      }
    } catch (e: unknown) {
      console.error(
        `[ServerSettingsRegistry] Failed to set setting "${key}":`,
        e
      );
      throw new Error(`Failed to set setting "${key}"`);
    }
  }

  /**
   * Delete a setting from the database (resets to default).
   */
  public async deleteSetting(key: ServerSettingKey): Promise<void> {
    try {
      await this.db
        .deleteFrom("server_settings")
        .where("setting_key", "=", key)
        .execute();

      // Remove from in-memory cache
      this.cache.delete(key);

      // Remove from Redis cache
      if (this.redis) {
        try {
          await this.redis.del(this.redisKey(key));
        } catch (redisError: unknown) {
          console.error(
            `[ServerSettingsRegistry] Failed to delete Redis cache for "${key}":`,
            redisError
          );
        }
      }
    } catch (e: unknown) {
      console.error(
        `[ServerSettingsRegistry] Failed to delete setting "${key}":`,
        e
      );
      throw new Error(`Failed to delete setting "${key}"`);
    }
  }

  /**
   * List all settings in the database along with defaults for missing settings.
   */
  public async listAllSettings(): Promise<ServerSettingRecord[]> {
    const allKeys = getAllSettingKeys();
    const records: ServerSettingRecord[] = [];

    let dbRows: ServerSettingRow[];
    try {
      dbRows = await this.db
        .selectFrom("server_settings")
        .selectAll()
        .orderBy("setting_key", "asc")
        .execute();
    } catch (e: unknown) {
      console.error(
        "[ServerSettingsRegistry] Failed to list settings from database:",
        e
      );
      dbRows = [];
    }

    // Create a map for quick lookup
    const dbRowMap = new Map<string, ServerSettingRow>();
    for (const row of dbRows) {
      dbRowMap.set(row.setting_key, row);
    }

    // Build result with all known settings
    for (const key of allKeys) {
      const dbRow = dbRowMap.get(key);
      if (dbRow) {
        records.push({
          key: dbRow.setting_key,
          value: this.parseStoredValue(
            key as ServerSettingKey,
            dbRow.setting_value
          ),
          valueType: dbRow.value_type,
          description: dbRow.description,
          updatedAt:
            typeof dbRow.updated_at === "number"
              ? dbRow.updated_at
              : parseInt(dbRow.updated_at),
          updatedBy: dbRow.updated_by,
        });
      } else {
        // Include default values for settings not in database
        records.push({
          key,
          value: getDefaultValue(key),
          valueType: getSettingValueType(key),
          description: SERVER_SETTING_DEFINITIONS[key].description,
          updatedAt: 0,
          updatedBy: null,
        });
      }
    }

    // Also include any unknown settings from the database
    for (const row of dbRows) {
      if (!isValidServerSettingKey(row.setting_key)) {
        records.push({
          key: row.setting_key,
          value: row.setting_value,
          valueType: row.value_type,
          description: row.description,
          updatedAt:
            typeof row.updated_at === "number"
              ? row.updated_at
              : parseInt(row.updated_at),
          updatedBy: row.updated_by,
        });
      }
    }

    return records;
  }

  /**
   * Clear the cache for a specific setting or all settings.
   */
  public clearCache(key?: ServerSettingKey): void {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  private setCacheEntry<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  private parseStoredValue<K extends ServerSettingKey>(
    key: K,
    storedValue: string
  ): ServerSettingValueTypes[K] {
    const valueType = getSettingValueType(key);
    const schema = getSettingSchema(key);

    let parsed: unknown;
    try {
      switch (valueType) {
        case "boolean":
          parsed = storedValue === "true";
          break;
        case "number":
          parsed = parseFloat(storedValue);
          break;
        case "json":
          parsed = JSON.parse(storedValue);
          break;
        case "string":
        default:
          parsed = storedValue;
          break;
      }
    } catch (e: unknown) {
      console.error(
        `[ServerSettingsRegistry] Failed to parse value for "${key}":`,
        e
      );
      return getDefaultValue(key);
    }

    // Validate against schema
    const result = schema.safeParse(parsed);
    if (!result.success) {
      console.error(
        `[ServerSettingsRegistry] Invalid stored value for "${key}":`,
        result.error
      );
      return getDefaultValue(key);
    }

    return result.data as ServerSettingValueTypes[K];
  }

  private serializeValue(
    value: unknown,
    valueType: string
  ): string {
    switch (valueType) {
      case "boolean":
        return value ? "true" : "false";
      case "number":
        return String(value);
      case "json":
        return JSON.stringify(value);
      case "string":
      default:
        return String(value);
    }
  }
}
