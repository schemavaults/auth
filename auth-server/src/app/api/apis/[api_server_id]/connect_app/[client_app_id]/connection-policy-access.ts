import { isHardcodedApiServerId } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db";
import { canUserManageResource } from "@/lib/ownership/resource-access";

/** The outcome of {@link checkConnectionPolicyAccess}. */
export type ConnectionPolicyAccess =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 404; message: string };

/** The 403 messages of one policy (they name what is being refused). */
export interface ConnectionPolicyAccessMessages {
  /** When the caller may neither manage the API server nor the app (view). */
  readonly view: string;
  /** When the caller may not manage the API server (manage). */
  readonly manage: string;
}

/**
 * Access to a per-connection policy of an app-to-API connection (the scope
 * allowances, the first-party flag): viewing needs management access to
 * either side (the API server decides what the app may get; the app's
 * managers may see it); managing needs management access to the API server
 * (operations restricted further, e.g. to platform administrators, add
 * their own route guard). Platform administrators pass both. Hardcoded API
 * servers define no API scopes (400), and the app must be connected (404).
 */
export async function checkConnectionPolicyAccess(
  db: Kysely<AuthDatabase>,
  user: UserData,
  api_server_id: string,
  client_app_id: string,
  access: "view" | "manage",
  messages: ConnectionPolicyAccessMessages,
): Promise<ConnectionPolicyAccess> {
  const [apiServer, app] = await Promise.all([
    new SchemaVaultsApiServerRegistry(db).getApiServer(api_server_id),
    new SchemaVaultsAppRegistry(db).getApp(client_app_id),
  ]);
  if (!apiServer) return { ok: false, status: 404, message: "API server not found" };
  if (!app) return { ok: false, status: 404, message: "App not found" };
  if (isHardcodedApiServerId(api_server_id)) {
    return { ok: false, status: 400, message: "Hardcoded API servers define no API scopes" };
  }
  if (!user.admin) {
    const managesApi = await canUserManageResource(db, user, apiServer);
    const allowed =
      access === "manage" ? managesApi : managesApi || (await canUserManageResource(db, user, app));
    if (!allowed) {
      return { ok: false, status: 403, message: messages[access] };
    }
  }
  const connected = await new SchemaVaultsAppToApiPermissionsRegistry(db).isAllowed(
    client_app_id,
    api_server_id,
  );
  if (!connected) {
    return { ok: false, status: 404, message: "The app is not connected to the API server" };
  }
  return { ok: true };
}
