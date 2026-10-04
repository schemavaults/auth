import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { ClientErrorRow } from "./client-errors-table";
import {
  applyClientErrorFilters,
  toNullableNumber,
  toNumber,
  type ClientErrorQueryFilters,
} from "./client-error-filters";

type Db = Kysely<AuthDatabase> | Transaction<AuthDatabase>;

export interface ListClientErrorsOptions extends ClientErrorQueryFilters {
  /** Page size. */
  limit: number;
  /** Rows to skip (newest first). */
  offset?: number;
}

export interface ClientErrorsPage {
  errors: ClientErrorRow[];
  /** Every error matching the filters, across pages. */
  total: number;
}

export function normalizeClientErrorRow(row: ClientErrorRow): ClientErrorRow {
  return {
    ...row,
    created_at: toNumber(row.created_at),
    occurred_at: toNullableNumber(row.occurred_at),
  };
}

/** One page of the client errors matching `options`, newest first, with the total match count. */
export async function listClientErrors(
  db: Db,
  options: ListClientErrorsOptions,
): Promise<ClientErrorsPage> {
  const [rows, countRow] = await Promise.all([
    applyClientErrorFilters(db.selectFrom("client_errors").selectAll(), options)
      .orderBy("created_at", "desc")
      .orderBy("client_error_id", "asc")
      .limit(options.limit)
      .offset(options.offset ?? 0)
      .execute(),
    applyClientErrorFilters(
      db.selectFrom("client_errors").select((eb) => eb.fn.countAll().as("total")),
      options,
    ).executeTakeFirst(),
  ]);

  return {
    errors: rows.map(normalizeClientErrorRow),
    total: toNumber(countRow?.total ?? 0),
  };
}

export async function getClientErrorById(
  db: Db,
  client_error_id: string,
): Promise<ClientErrorRow | null> {
  const row = await db
    .selectFrom("client_errors")
    .selectAll()
    .where("client_error_id", "=", client_error_id)
    .executeTakeFirst();
  return row ? normalizeClientErrorRow(row) : null;
}
