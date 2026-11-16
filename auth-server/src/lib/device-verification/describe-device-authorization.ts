import "server-only";
import type { SchemaVaultsApp, SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { AppConsentStatus } from "@schemavaults/auth-common";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { getApp } from "@/lib/auth-db/apps";
import type { DeviceAuthorization } from "@/lib/auth-db/device-authorizations";
import { describeAppConsentStatus, toAppConsentStatus } from "@/lib/oauth2/api-scopes";

/** What the `/device` page shows the user about a pending request. */
export interface DescribedDeviceAuthorization {
  client_app: Pick<SchemaVaultsApp, "app_id" | "app_name" | "app_description">;
  /** When the device asked (Unix epoch ms). */
  created_at: number;
  /** When the request expires (Unix epoch ms). */
  expires_at: number;
  /** What approving would grant: requested OIDC scopes, API scopes. */
  consent: AppConsentStatus;
}

/**
 * Describes a pending device authorization for the signed-in user deciding
 * it: the requesting app (its name and description are what its developers
 * typed in, unverified), the expiry, and what the request asks for, in the
 * same shape the PKCE consent screen uses. Null when the app is gone.
 */
export async function describeDeviceAuthorization({
  dbh,
  uid,
  authorization,
  environment,
  debug = false,
}: {
  dbh: ServerlessDatabase;
  uid: string;
  authorization: DeviceAuthorization;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}): Promise<DescribedDeviceAuthorization | null> {
  const app: SchemaVaultsApp | null = await getApp(dbh.db, authorization.client_app_id, debug);
  if (app === null) {
    return null;
  }
  const status = await describeAppConsentStatus({
    dbh,
    uid,
    client_app_id: app.app_id,
    scope: authorization.requested_scope,
    resource: authorization.resource,
    environment,
    debug,
  });
  return {
    client_app: {
      app_id: app.app_id,
      app_name: app.app_name,
      app_description: app.app_description,
    },
    created_at: authorization.created_at,
    expires_at: authorization.expires_at,
    consent: toAppConsentStatus(status),
  };
}

export default describeDeviceAuthorization;
