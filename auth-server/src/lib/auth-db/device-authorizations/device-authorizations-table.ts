import type { Generated, Insertable, Selectable } from "@schemavaults/dbh";

/** Where a device authorization stands (migration 00055). */
export const DEVICE_AUTHORIZATION_STATUSES = [
  "pending",
  "approved",
  "denied",
  "redeemed",
] as const;

export type DeviceAuthorizationStatus =
  (typeof DEVICE_AUTHORIZATION_STATUSES)[number];

/**
 * DEVICE_AUTHORIZATIONS (migration 00055): one row per RFC 8628 device
 * authorization request. See the migration for the lifecycle.
 */
export interface DeviceAuthorizationsTable {
  device_authorization_id: Generated<string>;
  /** SHA-256 (hex) of the device code. */
  device_code_hash: string;
  /** SHA-256 (hex) of the normalized user code. */
  user_code_hash: string;
  client_app_id: string;
  /** The requested scope (validated wire format); null when none. */
  requested_scope: string | null;
  /** The RFC 8707 `resource` of the request; null when none. */
  resource: string | null;
  status: DeviceAuthorizationStatus;
  /** The user who approved or denied the request. */
  uid: string | null;
  /** The granted scope, on approval; null for a plain OAuth 2.1 grant. */
  scope: string | null;
  /** The API server whose API scopes `scope` carries, on approval. */
  scope_api_server_id: string | null;
  /** The polling interval the token endpoint enforces, in seconds. */
  interval_seconds: number;
  /** Unix epoch ms. */
  created_at: number;
  /** Unix epoch ms. */
  expires_at: number;
  last_polled_at: number | null;
  decided_at: number | null;
  redeemed_at: number | null;
}

export type DeviceAuthorizationRow = Selectable<DeviceAuthorizationsTable>;
export type NewDeviceAuthorizationRow = Insertable<DeviceAuthorizationsTable>;

/**
 * APP_DEVICE_AUTHORIZATION_POLICIES (migration 00055): the client apps whose
 * managers enabled the device authorization grant.
 */
export interface AppDeviceAuthorizationPoliciesTable {
  app_id: string;
  /** Unix epoch ms. */
  enabled_at: number;
  /** Who enabled it; null once that user is deleted. */
  enabled_by: string | null;
}
