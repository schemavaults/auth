// Helpers shared by the device-authorizations resource functions.

import "server-only";
import type { ApiServerId, AppId } from "@schemavaults/app-definitions";
import {
  DEVICE_AUTHORIZATION_STATUSES,
  type DeviceAuthorizationRow,
  type DeviceAuthorizationStatus,
} from "./device-authorizations-table";

/**
 * A DEVICE_AUTHORIZATIONS row with its BIGINT columns as numbers (the
 * Postgres drivers return them as strings).
 */
export interface DeviceAuthorization {
  device_authorization_id: string;
  client_app_id: AppId;
  requested_scope: string | null;
  resource: string | null;
  status: DeviceAuthorizationStatus;
  uid: string | null;
  scope: string | null;
  scope_api_server_id: ApiServerId | null;
  interval_seconds: number;
  created_at: number;
  expires_at: number;
  last_polled_at: number | null;
  decided_at: number | null;
  redeemed_at: number | null;
}

function parseBigint(value: unknown, column: string): number {
  const parsed: number =
    typeof value === "string" ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`Failed to parse ${column} of a device_authorizations row`);
  }
  return parsed;
}

function parseNullableBigint(value: unknown, column: string): number | null {
  return value === null || value === undefined ? null : parseBigint(value, column);
}

function isDeviceAuthorizationStatus(
  value: unknown,
): value is DeviceAuthorizationStatus {
  return (
    typeof value === "string" &&
    (DEVICE_AUTHORIZATION_STATUSES as readonly string[]).includes(value)
  );
}

/** Converts a selected row; throws on a status the code does not know. */
export function toDeviceAuthorization(
  row: Omit<DeviceAuthorizationRow, "device_code_hash" | "user_code_hash">,
): DeviceAuthorization {
  if (!isDeviceAuthorizationStatus(row.status)) {
    throw new TypeError(
      `Unknown device authorization status '${String(row.status)}'`,
    );
  }
  return {
    device_authorization_id: row.device_authorization_id,
    client_app_id: row.client_app_id as AppId,
    requested_scope: row.requested_scope,
    resource: row.resource,
    status: row.status,
    uid: row.uid,
    scope: row.scope,
    scope_api_server_id: row.scope_api_server_id as ApiServerId | null,
    interval_seconds: Number(row.interval_seconds),
    created_at: parseBigint(row.created_at, "created_at"),
    expires_at: parseBigint(row.expires_at, "expires_at"),
    last_polled_at: parseNullableBigint(row.last_polled_at, "last_polled_at"),
    decided_at: parseNullableBigint(row.decided_at, "decided_at"),
    redeemed_at: parseNullableBigint(row.redeemed_at, "redeemed_at"),
  };
}

/** Every column except the two hashes, which never leave the database layer. */
export const DEVICE_AUTHORIZATION_COLUMNS = [
  "device_authorization_id",
  "client_app_id",
  "requested_scope",
  "resource",
  "status",
  "uid",
  "scope",
  "scope_api_server_id",
  "interval_seconds",
  "created_at",
  "expires_at",
  "last_polled_at",
  "decided_at",
  "redeemed_at",
] as const;

/** How long an expired row is kept, so late polls still get `expired_token`. */
export const EXPIRED_DEVICE_AUTHORIZATION_RETENTION_MS = 60 * 60 * 1000;
