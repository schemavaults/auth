import "server-only";

import { ServerSettingsRegistry } from "./server-settings-registry";
import type {
  ServerSettingKey,
  ServerSettingValueTypes,
} from "./server-setting-keys";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type Redis from "ioredis";

/**
 * Simple async getter for a server setting value.
 * Creates a new database connection for each call.
 * For batch operations, use ServerSettingsRegistry directly.
 */
export async function getServerSetting<K extends ServerSettingKey>(
  key: K,
  db: Kysely<AuthDatabase>,
  redis?: Redis
): Promise<ServerSettingValueTypes[K]> {
  return new ServerSettingsRegistry(db, undefined, redis).getSetting(key);
}

/**
 * Parser helpers for common env var patterns
 */
export const envParsers = {
  boolean: (value: string): boolean | undefined => {
    const lower = value.toLowerCase().trim();
    if (lower === "true" || lower === "1" || lower === "yes") {
      return true;
    }
    if (lower === "false" || lower === "0" || lower === "no") {
      return false;
    }
    return undefined;
  },

  number: (value: string): number | undefined => {
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  },

  string: (value: string): string => value,

  json: <T>(value: string): T | undefined => {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  },
} as const;
