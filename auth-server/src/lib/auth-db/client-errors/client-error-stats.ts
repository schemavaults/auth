import "server-only";
import { sql, type Kysely, type Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { CLIENT_ERROR_STATS_TOP_N } from "@/lib/client-errors/client-error-stats-limits";
import {
  bucketStart,
  chooseTimelineBucketMs,
  fillTimeline,
  type ClientErrorTimelineBucket,
} from "@/lib/client-errors/timeline";
import {
  applyClientErrorFilters,
  toNullableNumber,
  toNumber,
  type ClientErrorQueryFilters,
} from "./client-error-filters";

type Db = Kysely<AuthDatabase> | Transaction<AuthDatabase>;

export { CLIENT_ERROR_STATS_TOP_N };

export interface ClientErrorTotals {
  errors: number;
  /** Distinct fingerprints. */
  groups: number;
  apps: number;
  /** Distinct reported users (reports without a user are not counted). */
  users: number;
  first_seen: number | null;
  last_seen: number | null;
  /**
   * Errors matching the same filters in the window of the same length right
   * before `since_ms`; null when the filters have no `since_ms`.
   */
  previous_period_errors: number | null;
}

export interface ClientErrorGroupStats {
  fingerprint: string;
  /** Name, message and operation of the group's most recent error. */
  name: string;
  message: string;
  operation: string | null;
  latest_client_error_id: string;
  count: number;
  apps: number;
  users: number;
  first_seen: number;
  last_seen: number;
}

export interface ClientErrorAppStats {
  client_app_id: string;
  count: number;
  groups: number;
  last_seen: number;
}

export interface ClientErrorSdkStats {
  sdk_name: string | null;
  sdk_version: string | null;
  count: number;
}

export interface ClientErrorOperationStats {
  operation: string | null;
  count: number;
}

export interface ClientErrorStats {
  /** The window the timeline covers; `bucket_ms` is its bucket width. */
  window: { from: number; to: number; bucket_ms: number };
  totals: ClientErrorTotals;
  timeline: ClientErrorTimelineBucket[];
  /** Busiest groups first. */
  top_groups: ClientErrorGroupStats[];
  by_app: ClientErrorAppStats[];
  by_sdk_version: ClientErrorSdkStats[];
  by_operation: ClientErrorOperationStats[];
}

/** Summary statistics of the client errors matching `filters`, as of `now_ms`. */
export async function getClientErrorStats(
  db: Db,
  filters: ClientErrorQueryFilters,
  now_ms: number = Date.now(),
): Promise<ClientErrorStats> {
  const base = () => applyClientErrorFilters(db.selectFrom("client_errors"), filters);

  const totalsRow = await base()
    .select((eb) => [
      eb.fn.countAll().as("errors"),
      eb.fn.count("fingerprint").distinct().as("groups"),
      eb.fn.count("client_app_id").distinct().as("apps"),
      eb.fn.count("reported_uid").distinct().as("users"),
      eb.fn.min("created_at").as("first_seen"),
      eb.fn.max("created_at").as("last_seen"),
    ])
    .executeTakeFirst();

  const first_seen: number | null = toNullableNumber(totalsRow?.first_seen);
  const from: number = filters.since_ms ?? first_seen ?? now_ms;
  const to: number = now_ms;
  const bucket_ms: number = chooseTimelineBucketMs(to - from);
  // Inlined (not bound) so the SELECT and GROUP BY expressions are identical.
  const bucketExpr = sql<string>`(created_at / ${sql.lit(bucket_ms)}) * ${sql.lit(bucket_ms)}`;

  const previousPeriodQuery =
    filters.since_ms === undefined
      ? Promise.resolve(null)
      : applyClientErrorFilters(db.selectFrom("client_errors"), {
          ...filters,
          since_ms: filters.since_ms - (now_ms - filters.since_ms),
        })
          .where("created_at", "<", filters.since_ms)
          .select((eb) => eb.fn.countAll().as("errors"))
          .executeTakeFirst();

  const [previousRow, timelineRows, groupRows, appRows, sdkRows, operationRows] = await Promise.all([
    previousPeriodQuery,
    base()
      .select((eb) => [bucketExpr.as("bucket"), eb.fn.countAll().as("count")])
      .groupBy(bucketExpr)
      .execute(),
    base()
      .select((eb) => [
        "fingerprint",
        sql<string>`(array_agg(name ORDER BY created_at DESC))[1]`.as("name"),
        sql<string>`(array_agg(message ORDER BY created_at DESC))[1]`.as("message"),
        sql<string | null>`(array_agg(operation ORDER BY created_at DESC))[1]`.as("operation"),
        sql<string>`(array_agg(client_error_id ORDER BY created_at DESC))[1]`.as("latest_client_error_id"),
        eb.fn.countAll().as("count"),
        eb.fn.count("client_app_id").distinct().as("apps"),
        eb.fn.count("reported_uid").distinct().as("users"),
        eb.fn.min("created_at").as("first_seen"),
        eb.fn.max("created_at").as("last_seen"),
      ])
      .groupBy("fingerprint")
      .orderBy("count", "desc")
      .orderBy("last_seen", "desc")
      .limit(CLIENT_ERROR_STATS_TOP_N)
      .execute(),
    base()
      .select((eb) => [
        "client_app_id",
        eb.fn.countAll().as("count"),
        eb.fn.count("fingerprint").distinct().as("groups"),
        eb.fn.max("created_at").as("last_seen"),
      ])
      .groupBy("client_app_id")
      .orderBy("count", "desc")
      .orderBy("client_app_id", "asc")
      .limit(CLIENT_ERROR_STATS_TOP_N)
      .execute(),
    base()
      .select((eb) => ["sdk_name", "sdk_version", eb.fn.countAll().as("count")])
      .groupBy(["sdk_name", "sdk_version"])
      .orderBy("count", "desc")
      .orderBy("sdk_version", "desc")
      .limit(CLIENT_ERROR_STATS_TOP_N)
      .execute(),
    base()
      .select((eb) => ["operation", eb.fn.countAll().as("count")])
      .groupBy("operation")
      .orderBy("count", "desc")
      .orderBy("operation", "asc")
      .limit(CLIENT_ERROR_STATS_TOP_N)
      .execute(),
  ]);

  const counted = new Map<number, number>();
  for (const row of timelineRows) {
    const start: number = bucketStart(toNumber(row.bucket), bucket_ms);
    counted.set(start, (counted.get(start) ?? 0) + toNumber(row.count));
  }

  return {
    window: { from, to, bucket_ms },
    totals: {
      errors: toNumber(totalsRow?.errors ?? 0),
      groups: toNumber(totalsRow?.groups ?? 0),
      apps: toNumber(totalsRow?.apps ?? 0),
      users: toNumber(totalsRow?.users ?? 0),
      first_seen,
      last_seen: toNullableNumber(totalsRow?.last_seen),
      previous_period_errors: previousRow ? toNumber(previousRow.errors) : null,
    },
    timeline: fillTimeline(from, to, bucket_ms, counted),
    top_groups: groupRows.map(
      (row): ClientErrorGroupStats => ({
        fingerprint: row.fingerprint,
        name: row.name,
        message: row.message,
        operation: row.operation,
        latest_client_error_id: row.latest_client_error_id,
        count: toNumber(row.count),
        apps: toNumber(row.apps),
        users: toNumber(row.users),
        first_seen: toNumber(row.first_seen),
        last_seen: toNumber(row.last_seen),
      }),
    ),
    by_app: appRows.map(
      (row): ClientErrorAppStats => ({
        client_app_id: row.client_app_id,
        count: toNumber(row.count),
        groups: toNumber(row.groups),
        last_seen: toNumber(row.last_seen),
      }),
    ),
    by_sdk_version: sdkRows.map(
      (row): ClientErrorSdkStats => ({
        sdk_name: row.sdk_name,
        sdk_version: row.sdk_version,
        count: toNumber(row.count),
      }),
    ),
    by_operation: operationRows.map(
      (row): ClientErrorOperationStats => ({
        operation: row.operation,
        count: toNumber(row.count),
      }),
    ),
  };
}
