import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  type SchemaVaultsApiServerDefinition,
  type ApiServerId,
  isHardcodedApiServerId,
  isValidApiServerId,
  resourceUrlMatchModeSchema,
  type ResourceUrlMatchMode,
} from "@schemavaults/app-definitions";
import { getApiServer } from "./get-api-server";

/**
 * @description Updates the API server's dynamic-client policy (migration
 * 00040): whether RFC 7591 dynamically registered clients may request
 * tokens for it without an explicit connection, and how an RFC 8707
 * `resource` URL is matched against its registered domains. Hardcoded
 * API servers have no row and cannot be updated.
 */
export async function setApiServerDynamicClientPolicy(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  api_server_id: ApiServerId,
  policy: {
    allow_dynamic_clients?: boolean;
    resource_url_match_mode?: ResourceUrlMatchMode;
  },
  debug: boolean = false,
): Promise<SchemaVaultsApiServerDefinition | null> {
  if (!isValidApiServerId(api_server_id)) {
    throw new TypeError("Received invalid API server ID!");
  }
  if (isHardcodedApiServerId(api_server_id)) {
    throw new Error("Cannot update the dynamic-client policy of a hardcoded API server");
  }
  const update: {
    allow_dynamic_clients?: boolean;
    resource_url_match_mode?: ResourceUrlMatchMode;
  } = {};
  if (typeof policy.allow_dynamic_clients === "boolean") {
    update.allow_dynamic_clients = policy.allow_dynamic_clients;
  }
  if (policy.resource_url_match_mode !== undefined) {
    update.resource_url_match_mode = resourceUrlMatchModeSchema.parse(
      policy.resource_url_match_mode,
    );
  }
  if (Object.keys(update).length === 0) {
    throw new TypeError("No dynamic-client policy fields to update");
  }
  await db
    .updateTable("api_servers")
    .set(update)
    .where("api_server_id", "=", api_server_id)
    .execute();
  return await getApiServer(db, api_server_id, debug);
}

export default setApiServerDynamicClientPolicy;
