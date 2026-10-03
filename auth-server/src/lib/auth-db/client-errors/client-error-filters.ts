import type { SelectQueryBuilder } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

/** Narrows the client errors a listing or a stats query looks at. */
export interface ClientErrorQueryFilters {
  /** Keep errors received at or after this Unix epoch ms. */
  since_ms?: number;
  /** Keep errors of this client app. */
  client_app_id?: string;
  /** Keep errors of this group. */
  fingerprint?: string;
  /** Keep errors whose name, message or operation contains this text (case-insensitive). */
  q?: string;
}

/** Escapes the LIKE wildcards of `text` (the default `\` escape character). */
function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (char: string): string => `\\${char}`);
}

/** Applies `filters` to a query over CLIENT_ERRORS. */
export function applyClientErrorFilters<O>(
  query: SelectQueryBuilder<AuthDatabase, "client_errors", O>,
  filters: ClientErrorQueryFilters,
): SelectQueryBuilder<AuthDatabase, "client_errors", O> {
  let filtered = query;
  if (filters.since_ms !== undefined) {
    filtered = filtered.where("created_at", ">=", filters.since_ms);
  }
  if (filters.client_app_id) {
    filtered = filtered.where("client_app_id", "=", filters.client_app_id);
  }
  if (filters.fingerprint) {
    filtered = filtered.where("fingerprint", "=", filters.fingerprint);
  }
  const q: string | undefined = filters.q?.trim();
  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`;
    filtered = filtered.where((eb) =>
      eb.or([
        eb("name", "ilike", pattern),
        eb("message", "ilike", pattern),
        eb("operation", "ilike", pattern),
      ]),
    );
  }
  return filtered;
}

/**
 * Postgres BIGINT and COUNT() values come back from the driver as strings
 * to preserve 64-bit precision; the values here fit safely in a Number.
 */
export function toNumber(value: unknown): number {
  return typeof value === "string" ? parseInt(value, 10) : Number(value);
}

export function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : toNumber(value);
}
