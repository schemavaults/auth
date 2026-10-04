import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import type Redis from "ioredis";
import { NextResponse } from "next/server";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import captureServerException from "@/lib/captureServerException";
import {
  deleteExpiredClientErrors,
  loadClientErrorIntakeSettings,
} from "@/lib/client-errors/intake-policy";

export const PURGE_EXPIRED_CLIENT_ERRORS_ROUTE = "/api/admin/client-errors/purge-expired";

export interface PurgeExpiredClientErrorsInputs {
  db: Kysely<AuthDatabase>;
  redis: Redis;
  /** The administrator who triggered the run; absent for the cron job. */
  uid?: string;
}

/**
 * Deletes the client error reports older than the
 * `client_error_reports_retention_days` setting, immediately (no hourly
 * lock), for the scheduled job and for administrators. Shared by the
 * session-guarded operations and the cron-secret middleware, so both
 * answer with the same body.
 */
export async function purgeExpiredClientErrorsHandler({
  db,
  redis,
  uid,
}: PurgeExpiredClientErrorsInputs): Promise<Response> {
  try {
    const { retention_days } = await loadClientErrorIntakeSettings(db, redis);
    const purge = await deleteExpiredClientErrors(db, redis, retention_days);
    const message: string = purge
      ? `Deleted ${purge.deleted} client error${purge.deleted === 1 ? "" : "s"} received before ${new Date(purge.cutoff_ms).toISOString()} (retention: ${retention_days} day${retention_days === 1 ? "" : "s"}).`
      : "Retention is off (client_error_reports_retention_days is 0); nothing was deleted.";
    console.log(`[${PURGE_EXPIRED_CLIENT_ERRORS_ROUTE}] ${message}`);
    return NextResponse.json({
      success: true,
      message,
      data: { deleted: purge?.deleted ?? 0, retention_days, cutoff: purge?.cutoff_ms ?? null },
    });
  } catch (e: unknown) {
    await captureServerException(db, e, {
      op_name: "purge_expired_client_errors_handler.deleteExpiredClientErrors",
      route: PURGE_EXPIRED_CLIENT_ERRORS_ROUTE,
      uid,
    });
    return NextResponse.json(
      { success: false, message: "Failed to delete expired client errors" },
      { status: 500 },
    );
  }
}
