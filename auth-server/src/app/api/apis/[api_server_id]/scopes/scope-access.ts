import {
  isHardcodedApiServerId,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import {
  canUserManageResource,
  canUserViewResource,
} from "@/lib/ownership/resource-access";

export const SCOPES_ROUTE = "/api/apis/{api_server_id}/scopes";
export const SCOPE_ROUTE = "/api/apis/{api_server_id}/scopes/{api_server_scope_id}";

export const VIEW_SCOPES_AUTH_NOTES =
  "Anyone signed in for a public API server; for a private one, members (any role) of the owning organization, the owning user of a user-owned API server, or platform administrators.";
export const MANAGE_SCOPES_AUTH_NOTES =
  "Organization owners/admins of the owning organization, the owning user of a user-owned API server, or platform administrators.";

export type ApiServerScopesAccessResult =
  | { ok: true; apiServer: SchemaVaultsApiServerDefinition }
  | { ok: false; status: 400 | 403 | 404; message: string };

/**
 * Loads the API server of an API scope operation and checks the caller's
 * access: `view` lists the scopes, `manage` changes them. Hardcoded API
 * servers define no scopes, so managing theirs is refused (400).
 */
export async function loadApiServerForScopes(
  db: Kysely<AuthDatabase>,
  user: UserData,
  api_server_id: string,
  access: "view" | "manage",
): Promise<ApiServerScopesAccessResult> {
  const apiServer = await new SchemaVaultsApiServerRegistry(db).getApiServer(api_server_id);
  if (!apiServer) {
    return { ok: false, status: 404, message: "API server not found" };
  }
  if (!user.admin) {
    const allowed: boolean =
      access === "view"
        ? await canUserViewResource(db, user, apiServer)
        : await canUserManageResource(db, user, apiServer);
    if (!allowed) {
      return {
        ok: false,
        status: 403,
        message:
          access === "view"
            ? "You are not authorized to view this API server's scopes"
            : "You must be an admin or organization owner/admin to manage this API server's scopes",
      };
    }
  }
  if (access === "manage" && isHardcodedApiServerId(api_server_id)) {
    return { ok: false, status: 400, message: "Hardcoded API servers cannot define API scopes" };
  }
  return { ok: true, apiServer };
}
