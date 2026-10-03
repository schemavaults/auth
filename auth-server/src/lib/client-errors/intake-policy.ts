import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type Redis from "ioredis";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { deleteClientErrorsBefore, sumClientErrorSizeBytes } from "@/lib/auth-db/client-errors";
import { ServerSettingsRegistry } from "@/lib/auth-db/server-settings";
import { BYTES_PER_MB, type ClientErrorStorageStatus } from "./row-size";

/**
 * The administrator-controlled policy of the client error intake
 * (POST /api/client-errors/{client_app_id}) and the storage accounting it
 * enforces. The stored-bytes total is cached in Redis: the intake adds each
 * stored report to it, deletions drop it, and it is recomputed from the
 * database when missing (at most every {@link STORED_BYTES_CACHE_TTL_SECONDS}).
 */

const STORED_BYTES_CACHE_KEY = "client-errors:stored-bytes";
const STORED_BYTES_CACHE_TTL_SECONDS: number = 300;
const RETENTION_PURGE_LOCK_KEY = "client-errors:retention-purge-lock";
const RETENTION_PURGE_INTERVAL_SECONDS: number = 60 * 60;
const DAY_MS: number = 24 * 60 * 60 * 1000;

/** Adds to the cached total only when it exists (a missing total is recomputed from the database). */
const INCREMENT_IF_EXISTS_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return redis.call('INCRBY', KEYS[1], ARGV[1])
end
return nil
`;

type Db = Kysely<AuthDatabase>;

export interface ClientErrorIntakeSettings {
  accepting_reports: boolean;
  max_storage_bytes: number;
  /** 0 keeps reports until an administrator deletes them. */
  retention_days: number;
}

export async function loadClientErrorIntakeSettings(db: Db, redis?: Redis): Promise<ClientErrorIntakeSettings> {
  const registry = new ServerSettingsRegistry(db, undefined, redis);
  const [accepting_reports, max_storage_mb, retention_days] = await Promise.all([
    registry.getSetting("accept_client_error_reports"),
    registry.getSetting("client_error_reports_max_storage_mb"),
    registry.getSetting("client_error_reports_retention_days"),
  ]);
  return { accepting_reports, max_storage_bytes: max_storage_mb * BYTES_PER_MB, retention_days };
}

/** The stored reports' total size: the cached value, or a fresh sum when missing, `fresh` or Redis fails. */
export async function getStoredClientErrorBytes(
  db: Db,
  redis: Redis,
  options: { fresh?: boolean } = {},
): Promise<number> {
  if (!options.fresh) {
    try {
      const cached: string | null = await redis.get(STORED_BYTES_CACHE_KEY);
      if (cached !== null && Number.isFinite(Number(cached))) return Number(cached);
    } catch (e: unknown) {
      console.error("[client-errors] Failed to read the cached stored-bytes total:", e);
    }
  }
  const total: number = await sumClientErrorSizeBytes(db);
  try {
    await redis.set(STORED_BYTES_CACHE_KEY, String(total), "EX", STORED_BYTES_CACHE_TTL_SECONDS);
  } catch (e: unknown) {
    console.error("[client-errors] Failed to cache the stored-bytes total:", e);
  }
  return total;
}

/** Counts a newly stored report into the cached total. Never throws. */
export async function recordStoredClientErrorBytes(redis: Redis, bytes: number): Promise<void> {
  try {
    await redis.eval(INCREMENT_IF_EXISTS_SCRIPT, 1, STORED_BYTES_CACHE_KEY, String(Math.max(0, Math.round(bytes))));
  } catch (e: unknown) {
    console.error("[client-errors] Failed to update the cached stored-bytes total:", e);
  }
}

/** Drops the cached total after reports were deleted. Never throws. */
export async function forgetStoredClientErrorBytes(redis: Redis): Promise<void> {
  try {
    await redis.del(STORED_BYTES_CACHE_KEY);
  } catch (e: unknown) {
    console.error("[client-errors] Failed to drop the cached stored-bytes total:", e);
  }
}

/**
 * Deletes the reports older than the retention period, at most once per
 * {@link RETENTION_PURGE_INTERVAL_SECONDS} across all server instances (a
 * Redis lock). Returns how many reports were deleted, or null when the purge
 * was not due or retention is off. Never throws.
 */
export async function purgeExpiredClientErrors(
  db: Db,
  redis: Redis,
  retention_days: number,
  now_ms: number = Date.now(),
): Promise<number | null> {
  if (retention_days <= 0) return null;
  try {
    const acquired = await redis.set(RETENTION_PURGE_LOCK_KEY, String(now_ms), "EX", RETENTION_PURGE_INTERVAL_SECONDS, "NX");
    if (acquired !== "OK") return null;
    const deleted: number = await deleteClientErrorsBefore(db, now_ms - retention_days * DAY_MS);
    if (deleted > 0) await forgetStoredClientErrorBytes(redis);
    return deleted;
  } catch (e: unknown) {
    console.error("[client-errors] Retention purge failed:", e);
    return null;
  }
}

/** Intake settings and the exact stored total (refreshing the cache), for administrators. */
export async function loadClientErrorStorageStatus(db: Db, redis: Redis): Promise<ClientErrorStorageStatus> {
  const [settings, used_bytes] = await Promise.all([
    loadClientErrorIntakeSettings(db, redis),
    getStoredClientErrorBytes(db, redis, { fresh: true }),
  ]);
  return {
    accepting_reports: settings.accepting_reports,
    used_bytes,
    max_bytes: settings.max_storage_bytes,
    retention_days: settings.retention_days,
  };
}
