/**
 * Bytes a stored client error report is accounted for: the UTF-8 size of its
 * text columns and serialized context, plus a fixed allowance for the ids,
 * timestamps and row/index overhead. Postgres may compress large values, so
 * this is an upper bound of the space the contents take, which is what the
 * `client_error_reports_max_storage_mb` setting limits. Isomorphic.
 */

/** Ids, timestamps, the fingerprint and per-row / index overhead. */
export const CLIENT_ERROR_ROW_FIXED_BYTES: number = 256;

const encoder = new TextEncoder();

function utf8Bytes(value: string | null | undefined): number {
  return value ? encoder.encode(value).length : 0;
}

export interface ClientErrorRowContents {
  client_app_id: string;
  name: string;
  message: string;
  stack: string | null;
  operation: string | null;
  sdk_name: string | null;
  sdk_version: string | null;
  app_env: string | null;
  page_url: string | null;
  origin: string | null;
  user_agent: string | null;
  reported_uid: string | null;
  context: Record<string, unknown> | null;
}

export function estimateClientErrorRowBytes(row: ClientErrorRowContents): number {
  const text: number = [
    row.client_app_id,
    row.name,
    row.message,
    row.stack,
    row.operation,
    row.sdk_name,
    row.sdk_version,
    row.app_env,
    row.page_url,
    row.origin,
    row.user_agent,
    row.reported_uid,
  ].reduce((sum: number, value: string | null): number => sum + utf8Bytes(value), 0);
  const context: number = row.context ? utf8Bytes(JSON.stringify(row.context)) : 0;
  return CLIENT_ERROR_ROW_FIXED_BYTES + text + context;
}

export const BYTES_PER_MB: number = 1024 * 1024;

/** The intake's settings and storage use, as the admin dashboard shows them. Isomorphic. */
export interface ClientErrorStorageStatus {
  /** The `accept_client_error_reports` setting. */
  accepting_reports: boolean;
  /** Total size of the stored reports. */
  used_bytes: number;
  /** The `client_error_reports_max_storage_mb` setting, in bytes. */
  max_bytes: number;
  /** The `client_error_reports_retention_days` setting (0: kept until deleted). */
  retention_days: number;
}
