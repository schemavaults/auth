import {
  apiServerIdSchema,
  appIdSchema,
  isHardcodedApiServerId,
  type SchemaVaultsApiServerDefinition,
  type SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import { z, withOpenApi } from "@schemavaults/openapi-operations";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { isUserOwnerOfResource } from "@/lib/ownership/resource-access";

export const ROUTE = "/api/apis/{api_server_id}/connect_app/{client_app_id}";

/** Path parameters shared by the app-to-API connection operations. */
export const connectionParams = z.object({
  api_server_id: withOpenApi(apiServerIdSchema, { description: "API server id", example: "my-resource-api" }),
  client_app_id: withOpenApi(appIdSchema, { description: "Client application id", example: "my-web-app" }),
});

export const CONNECTION_AUTH_NOTES =
  "The caller must own the client application (organization owner, owning user, or platform administrator) and, unless the API server is a public hardcoded one, must own the API server too.";

/** The 403 messages of one operation (they name the action being refused). */
export interface ConnectionAccessMessages {
  /** When the caller does not own the client application. */
  readonly app: string;
  /** When the caller owns the application but not the API server. */
  readonly both: string;
}

export type ConnectionAccessResult =
  | { ok: true; app: SchemaVaultsApp; apiServer: SchemaVaultsApiServerDefinition }
  | { ok: false; status: 403 | 404; message: string };

/**
 * Loads the client application and the API server of an app-to-API
 * connection and checks the caller may manage that connection: the caller
 * must own the app (organization owner, the owning user of a user-owned
 * app, or a global admin) and, unless the API server is a public hardcoded
 * one, must own the API server too.
 */
export async function loadConnectionResources(
  db: Kysely<AuthDatabase>,
  user: UserData,
  api_server_id: string,
  client_app_id: string,
  messages: ConnectionAccessMessages,
): Promise<ConnectionAccessResult> {
  const appsRegistry = new SchemaVaultsAppRegistry(db);
  const apiServerRegistry = new SchemaVaultsApiServerRegistry(db);

  const [app, apiServer] = await Promise.all([
    appsRegistry.getApp(client_app_id),
    apiServerRegistry.getApiServer(api_server_id),
  ]);

  if (!app) return { ok: false, status: 404, message: "App not found" };
  if (!apiServer) return { ok: false, status: 404, message: "API server not found" };

  if (!user.admin) {
    const isHardcoded = isHardcodedApiServerId(api_server_id);
    const isPublicHardcoded = isHardcoded && apiServer.public === true;

    const userOwnsApp: boolean = await isUserOwnerOfResource(db, user, app);
    if (!userOwnsApp) return { ok: false, status: 403, message: messages.app };

    // For non-public hardcoded APIs, require admin (already blocked above since !user.admin)
    // For public hardcoded APIs, only app ownership is needed (checked above)
    // For dynamic APIs, also require API server ownership
    if (!isPublicHardcoded) {
      const userOwnsApi: boolean = await isUserOwnerOfResource(db, user, apiServer);
      if (!userOwnsApi) return { ok: false, status: 403, message: messages.both };
    }
  }

  return { ok: true, app, apiServer };
}
