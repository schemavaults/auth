import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { NewErrorRow } from "@/lib/auth-db/errors";

export interface CaptureServerExceptionOptions {
  op_name?: string;
  route?: string;
  uid?: string;
  context?: unknown;
}

// Persists a caught exception to the ERRORS table for later triage on
// /admin/errors. Contract: this function MUST NOT throw. If the sink write
// fails for any reason, we fall back to console.error so a broken logger
// never masks the original exception.
export async function captureServerException(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  err: unknown,
  opts: CaptureServerExceptionOptions = {},
): Promise<void> {
  try {
    const row: NewErrorRow = {
      error_id: crypto.randomUUID(),
      created_at: Date.now(),
      name: err instanceof Error ? err.name : "UnknownError",
      message:
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : safeStringify(err),
      stack: err instanceof Error ? (err.stack ?? null) : null,
      op_name: opts.op_name ?? null,
      route: opts.route ?? null,
      uid: opts.uid ?? null,
      context: opts.context ?? null,
    };
    await db.insertInto("errors").values(row).execute();
  } catch (sinkErr: unknown) {
    console.error("captureServerException failed to persist error:", sinkErr);
    console.error("original error:", err);
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export default captureServerException;
