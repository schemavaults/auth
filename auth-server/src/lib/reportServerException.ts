import "server-only";
import { ServerlessDatabase } from "@/lib/auth-db/serverless-database";
import captureServerException, {
  type CaptureServerExceptionOptions,
} from "@/lib/captureServerException";

export interface ReportServerExceptionOptions extends CaptureServerExceptionOptions {
  /**
   * Record at most one error per `op_name` in this many milliseconds (per
   * server instance). For best-effort fallbacks on a hot path, which would
   * otherwise write one row per request for as long as an outage lasts.
   * Throttled errors are still written to the console.
   */
  throttle_ms?: number;
}

const lastReportedAt = new Map<string, number>();

/**
 * {@link captureServerException} for code with no database handle in scope
 * (library helpers, server components, the Next.js `onRequestError` hook):
 * opens a database handle of its own and releases it afterwards. Like
 * `captureServerException`, it never throws.
 */
export async function reportServerException(
  err: unknown,
  opts: ReportServerExceptionOptions = {},
): Promise<void> {
  const { throttle_ms, ...capture } = opts;
  if (throttle_ms !== undefined) {
    const key: string = capture.op_name ?? "";
    const now: number = Date.now();
    const last: number | undefined = lastReportedAt.get(key);
    if (last !== undefined && now - last < throttle_ms) {
      console.error(`[${key}] error (not recorded again within ${throttle_ms}ms):`, err);
      return;
    }
    lastReportedAt.set(key, now);
  }

  try {
    await using dbh = ServerlessDatabase.createDBH();
    await captureServerException(dbh.db, err, capture);
  } catch (sinkErr: unknown) {
    console.error("reportServerException failed to open or release a database handle:", sinkErr);
    console.error("original error:", err);
  }
}

export default reportServerException;
