import "server-only";
import {
  apiServerIdSchema,
  appIdSchema,
  type ApiServerId,
  type AppId,
} from "@schemavaults/app-definitions";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { AppNotConnectedForScopesError } from "./api-scope-grants";

/**
 * First-party app-to-API connections (APP_API_SCOPE_POLICIES.first_party,
 * migration 00053): the app and the API server belong to the same party,
 * so a user signing in to the app for the API server consents implicitly
 * (no consent screen; see `resolveAuthorizationCodeGrant()` and
 * `recordImplicitConsentForGrant()`). Only platform administrators set it.
 */

type Db = Kysely<AuthDatabase> | Transaction<AuthDatabase>;

function assertIds(client_app_id: string, api_server_id: string): void {
  if (!appIdSchema.safeParse(client_app_id).success) {
    throw new TypeError("Invalid client app ID!");
  }
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }
}

/**
 * Whether the connection of `client_app_id` to `api_server_id` is
 * first-party. False without a connection or a policy row.
 */
export async function isFirstPartyAppApiConnection(
  db: Db,
  client_app_id: AppId,
  api_server_id: ApiServerId,
): Promise<boolean> {
  assertIds(client_app_id, api_server_id);
  const row = await db
    .selectFrom("app_api_scope_policies")
    .where("client_app_id", "=", client_app_id)
    .where("api_server_id", "=", api_server_id)
    .select(["first_party"])
    .executeTakeFirst();
  return row?.first_party === true;
}

/** The ids of the apps whose connection to `api_server_id` is first-party. */
export async function listFirstPartyConnectedAppIds(
  db: Db,
  api_server_id: ApiServerId,
): Promise<AppId[]> {
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }
  const rows = await db
    .selectFrom("app_api_scope_policies")
    .where("api_server_id", "=", api_server_id)
    .where("first_party", "=", true)
    .orderBy("client_app_id", "asc")
    .select(["client_app_id"])
    .execute();
  return rows.map((row) => row.client_app_id as AppId);
}

export interface SetFirstPartyAppApiConnectionOptions {
  client_app_id: AppId;
  api_server_id: ApiServerId;
  first_party: boolean;
  updated_by: string | null;
}

/**
 * Marks the connection first-party, or not. Keeps the connection's scope
 * allowances as they are. Turning it off does not withdraw the consents
 * already recorded through it: users keep what they implicitly granted
 * (they can withdraw it on their third-party access page) and are asked
 * for anything new.
 *
 * @throws AppNotConnectedForScopesError when the app is not connected.
 */
export async function setFirstPartyAppApiConnection(
  db: Kysely<AuthDatabase>,
  { client_app_id, api_server_id, first_party, updated_by }: SetFirstPartyAppApiConnectionOptions,
): Promise<boolean> {
  assertIds(client_app_id, api_server_id);
  return await db.transaction().execute(async (trx) => {
    const connection = await trx
      .selectFrom("apps_to_apis_permissions")
      .where("client_app_id", "=", client_app_id)
      .where("api_server_id", "=", api_server_id)
      .select(["client_app_id"])
      .executeTakeFirst();
    if (!connection) {
      throw new AppNotConnectedForScopesError(client_app_id, api_server_id);
    }
    const now = Date.now();
    await trx
      .insertInto("app_api_scope_policies")
      .values({ client_app_id, api_server_id, first_party, updated_at: now, updated_by })
      .onConflict((oc) =>
        oc.columns(["client_app_id", "api_server_id"]).doUpdateSet({
          first_party,
          updated_at: now,
          updated_by,
        }),
      )
      .execute();
    return await isFirstPartyAppApiConnection(trx, client_app_id, api_server_id);
  });
}
