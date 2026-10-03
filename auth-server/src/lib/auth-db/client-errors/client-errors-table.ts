import type { Insertable, Selectable } from "@schemavaults/dbh";

export interface ClientErrorsTable {
  client_error_id: string;
  /** When the server received the report (Unix epoch ms). */
  created_at: number;
  /** When the error happened, as the client reported it (Unix epoch ms). */
  occurred_at: number | null;
  client_app_id: string;
  fingerprint: string;
  name: string;
  message: string;
  stack: string | null;
  operation: string | null;
  sdk_name: string | null;
  sdk_version: string | null;
  app_env: string | null;
  page_url: string | null;
  /** The request's `Origin` header. */
  origin: string | null;
  /** The request's `User-Agent` header. */
  user_agent: string | null;
  /** The signed-in user as the client reported it (not verified). */
  reported_uid: string | null;
  context: Record<string, unknown> | null;
  /** Size of the row's contents in bytes (see lib/client-errors/row-size.ts). */
  size_bytes: number;
}

export type ClientErrorRow = Selectable<ClientErrorsTable>;
export type NewClientErrorRow = Insertable<ClientErrorsTable>;
