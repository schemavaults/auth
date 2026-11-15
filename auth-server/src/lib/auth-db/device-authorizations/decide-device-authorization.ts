import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { ApiServerId } from "@schemavaults/app-definitions";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

/** The user's decision on a device authorization request. */
export type DeviceAuthorizationDecision =
  | {
      decision: "approved";
      /** The granted scope; null for a plain OAuth 2.1 grant. */
      scope: string | null;
      /** The API server whose API scopes `scope` carries. */
      scope_api_server_id: ApiServerId | null;
    }
  | { decision: "denied" };

export interface DecideDeviceAuthorizationOptions {
  device_authorization_id: string;
  /** The signed-in user deciding the request. */
  uid: string;
  decision: DeviceAuthorizationDecision;
  now?: number;
}

/**
 * Records the user's decision on a PENDING, unexpired device authorization.
 * Atomic: of two concurrent decisions only one lands. Returns false when the
 * request was no longer pending (already decided, redeemed or expired).
 */
export async function decideDeviceAuthorization(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  { device_authorization_id, uid, decision, now = Date.now() }: DecideDeviceAuthorizationOptions,
): Promise<boolean> {
  const result = await db
    .updateTable("device_authorizations")
    .set(
      decision.decision === "approved"
        ? {
            status: "approved",
            uid,
            decided_at: now,
            scope: decision.scope,
            scope_api_server_id: decision.scope_api_server_id,
          }
        : { status: "denied", uid, decided_at: now, scope: null, scope_api_server_id: null },
    )
    .where("device_authorization_id", "=", device_authorization_id)
    .where("status", "=", "pending")
    .where("expires_at", ">", now)
    .executeTakeFirst();
  return Number(result.numUpdatedRows ?? 0) === 1;
}

export default decideDeviceAuthorization;
