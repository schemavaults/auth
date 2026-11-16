// client-application-device-authorization.ts
//
// Whether a client application may use the OAuth 2.0 device authorization
// grant (RFC 8628): `GET` / `PUT /api/apps/{app_id}/device-authorization`.
// Off for every app until its managers enable it.

import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";

export interface ClientApplicationDeviceAuthorizationPolicy {
  /** False for dynamically registered clients, which can never use the grant. */
  available: boolean;
  /** Whether the app may start device flows and redeem them. */
  enabled: boolean;
  /** When it was enabled (ms since epoch); null when disabled. */
  enabled_at: number | null;
}

interface IClientApplicationDeviceAuthorizationOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_id: AppId;
}

function endpoint(auth_server_uri: string, app_id: AppId): string {
  return new URL(`/api/apps/${app_id}/device-authorization`, auth_server_uri).toString();
}

/** Parses the endpoints' response body; throws on an unexpected shape. */
export function parseClientApplicationDeviceAuthorizationPolicy(
  body: unknown,
): ClientApplicationDeviceAuthorizationPolicy {
  if (
    typeof body !== "object" ||
    body === null ||
    (body as { success?: unknown }).success !== true ||
    typeof (body as { enabled?: unknown }).enabled !== "boolean" ||
    typeof (body as { available?: unknown }).available !== "boolean"
  ) {
    throw new Error("Invalid response from the device authorization setting endpoint");
  }
  const policy = body as { available: boolean; enabled: boolean; enabled_at?: unknown };
  return {
    available: policy.available,
    enabled: policy.enabled,
    enabled_at: typeof policy.enabled_at === "number" ? policy.enabled_at : null,
  };
}

type AdapterFetchInit = NonNullable<Parameters<ISchemaVaultsAuthClientAdapter["fetch"]>[1]>;

async function send(
  { adapter, auth_server_uri, app_id }: IClientApplicationDeviceAuthorizationOpts,
  init: AdapterFetchInit,
  failure: string,
): Promise<ClientApplicationDeviceAuthorizationPolicy> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid app_id");
  }
  const response = await adapter.fetch(endpoint(auth_server_uri, app_id), {
    ...init,
    credentials: "include",
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message: unknown =
      typeof body === "object" && body !== null ? (body as { message?: unknown }).message : undefined;
    throw new Error(typeof message === "string" ? message : `${failure}: ${response.status}`);
  }
  return parseClientApplicationDeviceAuthorizationPolicy(body);
}

/** Whether the app may use the device authorization grant (management access required). */
export async function getClientApplicationDeviceAuthorization(
  opts: IClientApplicationDeviceAuthorizationOpts,
): Promise<ClientApplicationDeviceAuthorizationPolicy> {
  return await send(opts, { method: "GET" }, "Failed to load the device authorization setting");
}

/**
 * Enables or disables the device authorization grant for the app. Disabling
 * discards its device sign-in requests that were not redeemed yet.
 */
export async function setClientApplicationDeviceAuthorization({
  enabled,
  ...opts
}: IClientApplicationDeviceAuthorizationOpts & {
  enabled: boolean;
}): Promise<ClientApplicationDeviceAuthorizationPolicy> {
  if (typeof enabled !== "boolean") {
    throw new TypeError("Expected 'enabled' to be a boolean");
  }
  return await send(
    opts,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    },
    "Failed to save the device authorization setting",
  );
}
