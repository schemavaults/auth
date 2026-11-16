import "server-only";
import type { Kysely } from "@schemavaults/dbh";
import {
  isDynamicallyRegisteredClient,
  type SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import { OAUTH_DEVICE_CODE_GRANT_TYPE } from "@schemavaults/auth-common";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { isDeviceAuthorizationEnabledForApp } from "@/lib/auth-db/device-authorizations";
import { isGrantTypeAllowedForClientApp } from "@/lib/oauth2/client-grant-types";

export type DeviceFlowClientCheck =
  | { ok: true }
  | {
      ok: false;
      error: "invalid_client" | "unauthorized_client";
      error_description: string;
    };

/**
 * Whether `client_app` may use the device authorization grant, checked at
 * both ends of the flow (the device authorization request, and every poll
 * of the token endpoint, so disabling the grant cuts off flows in progress):
 *
 * - The app must exist (`invalid_client` otherwise: RFC 8628 §3.1 requests
 *   are authenticated like token requests).
 * - Its registered grant types must allow it, and dynamically registered
 *   clients never get it (anyone can register one anonymously, and the
 *   device flow is the phishing-prone one: whoever starts it chooses which
 *   user is shown the code).
 * - Its managers must have enabled it (APP_DEVICE_AUTHORIZATION_POLICIES).
 */
export async function checkDeviceFlowClient(
  db: Kysely<AuthDatabase>,
  client_app: SchemaVaultsApp | null,
): Promise<DeviceFlowClientCheck> {
  if (client_app === null) {
    return {
      ok: false,
      error: "invalid_client",
      error_description: "Unknown client application.",
    };
  }
  if (
    isDynamicallyRegisteredClient(client_app) ||
    !isGrantTypeAllowedForClientApp(client_app, OAUTH_DEVICE_CODE_GRANT_TYPE)
  ) {
    return {
      ok: false,
      error: "unauthorized_client",
      error_description:
        "This client is not authorized to use the device authorization grant.",
    };
  }
  if (!(await isDeviceAuthorizationEnabledForApp(db, client_app.app_id))) {
    return {
      ok: false,
      error: "unauthorized_client",
      error_description:
        "The device authorization grant is not enabled for this client application; its managers can enable it on the app's page.",
    };
  }
  return { ok: true };
}

export default checkDeviceFlowClient;
