// Whether a client application may use the device authorization grant
// (APP_DEVICE_AUTHORIZATION_POLICIES, migration 00055). Off by default: a
// device flow lets anyone who knows an app's id put a code in front of a
// user and ask them to approve it, so an app's managers opt in.

import "server-only";
import {
  appIdSchema,
  isHardcodedAppId,
  type AppId,
} from "@schemavaults/app-definitions";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export interface AppDeviceAuthorizationPolicy {
  enabled: boolean;
  /** When it was enabled (Unix epoch ms); null when disabled. */
  enabled_at: number | null;
  /** Who enabled it; null when disabled or that user is gone. */
  enabled_by: string | null;
}

function assertManagedAppId(app_id: AppId): void {
  if (!appIdSchema.safeParse(app_id).success) {
    throw new TypeError("Invalid app ID for a device authorization policy!");
  }
}

/** The app's device authorization policy. Hardcoded apps are always disabled. */
export async function getAppDeviceAuthorizationPolicy(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
): Promise<AppDeviceAuthorizationPolicy> {
  assertManagedAppId(app_id);
  if (isHardcodedAppId(app_id)) {
    return { enabled: false, enabled_at: null, enabled_by: null };
  }
  const row = await db
    .selectFrom("app_device_authorization_policies")
    .select(["enabled_at", "enabled_by"])
    .where("app_id", "=", app_id)
    .executeTakeFirst();
  if (!row) {
    return { enabled: false, enabled_at: null, enabled_by: null };
  }
  const enabled_at: number = Number(row.enabled_at);
  return {
    enabled: true,
    enabled_at: Number.isFinite(enabled_at) ? enabled_at : null,
    enabled_by: row.enabled_by,
  };
}

/** Whether the app may start device flows and redeem their device codes. */
export async function isDeviceAuthorizationEnabledForApp(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
): Promise<boolean> {
  return (await getAppDeviceAuthorizationPolicy(db, app_id)).enabled;
}

/**
 * Enables or disables the grant for an app with an APPS row (the caller
 * checks the app may use it). Enabling an enabled app keeps its original
 * `enabled_at`. Disabling also deletes the app's device authorizations that
 * have not been redeemed, so no code shown before can still be approved.
 * Returns whether anything changed.
 */
export async function setAppDeviceAuthorizationEnabled(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
  enabled: boolean,
  changed_by: string | null,
): Promise<boolean> {
  assertManagedAppId(app_id);
  if (isHardcodedAppId(app_id)) {
    throw new Error("Hardcoded apps cannot use the device authorization grant");
  }
  if (enabled) {
    const inserted = await db
      .insertInto("app_device_authorization_policies")
      .values({ app_id, enabled_at: Date.now(), enabled_by: changed_by })
      .onConflict((oc) => oc.column("app_id").doNothing())
      .executeTakeFirst();
    return Number(inserted.numInsertedOrUpdatedRows ?? 0) > 0;
  }
  const deleted = await db
    .deleteFrom("app_device_authorization_policies")
    .where("app_id", "=", app_id)
    .executeTakeFirst();
  await db
    .deleteFrom("device_authorizations")
    .where("client_app_id", "=", app_id)
    .where("status", "!=", "redeemed")
    .execute();
  return Number(deleted.numDeletedRows ?? 0) > 0;
}
