import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { ServerTraceRow } from "./server-traces-table";

export interface ListServerTracesOptions {
  /** How many of the most recent matching traces to return. */
  limit: number;
  /** Keep traces that started at or after this Unix epoch ms. */
  since_ms?: number;
  /** Keep traces of these operations; empty or omitted keeps every operation. */
  op_names?: readonly string[];
  /** Keep traces of these categories; empty or omitted keeps every category. */
  op_categories?: readonly string[];
}

/**
 * Postgres BIGINT columns come back from the driver as strings to preserve
 * 64-bit precision. start_time/end_time are ms epoch timestamps that fit
 * safely in Number, so coerce them before they reach JSON or arithmetic.
 */
function toNumber(value: unknown): number {
  return typeof value === "string" ? parseInt(value, 10) : Number(value);
}

/** The most recent traces matching `options`, newest first. */
export async function listServerTraces(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  options: ListServerTracesOptions,
): Promise<ServerTraceRow[]> {
  let query = db.selectFrom("server_traces").selectAll();
  if (options.since_ms !== undefined) {
    query = query.where("start_time", ">=", options.since_ms);
  }
  if (options.op_names && options.op_names.length > 0) {
    query = query.where("op_name", "in", [...options.op_names]);
  }
  if (options.op_categories && options.op_categories.length > 0) {
    query = query.where("op_category", "in", [...options.op_categories]);
  }

  const rows = await query
    .orderBy("start_time", "desc")
    .limit(options.limit)
    .execute();

  return rows.map(
    (row): ServerTraceRow => ({
      ...row,
      start_time: toNumber(row.start_time),
      end_time: toNumber(row.end_time),
    }),
  );
}

export interface ServerTraceOperationRow {
  op_name: string;
  op_category: string;
  /** Number of traces recorded for the operation in the window. */
  count: number;
  /** Start of the operation's most recent trace (Unix epoch ms). */
  last_seen: number;
}

/**
 * Every operation that recorded a trace at or after `since_ms` (all time
 * when omitted), with its trace count, busiest first.
 */
export async function listServerTraceOperations(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  options: { since_ms?: number } = {},
): Promise<ServerTraceOperationRow[]> {
  let query = db
    .selectFrom("server_traces")
    .select((eb) => [
      "op_name",
      "op_category",
      eb.fn.countAll().as("count"),
      eb.fn.max("start_time").as("last_seen"),
    ]);
  if (options.since_ms !== undefined) {
    query = query.where("start_time", ">=", options.since_ms);
  }

  const rows = await query
    .groupBy(["op_name", "op_category"])
    .orderBy("count", "desc")
    .orderBy("op_name", "asc")
    .execute();

  return rows.map(
    (row): ServerTraceOperationRow => ({
      op_name: row.op_name,
      op_category: row.op_category,
      count: toNumber(row.count),
      last_seen: toNumber(row.last_seen),
    }),
  );
}
