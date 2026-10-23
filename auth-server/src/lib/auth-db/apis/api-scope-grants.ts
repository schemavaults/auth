import "server-only";
import {
  apiServerIdSchema,
  appIdSchema,
  isDynamicallyRegisteredClient,
  type ApiServerId,
  type AppId,
} from "@schemavaults/app-definitions";
import type {
  ApiScopeGrantee,
  AppApiScopePolicy,
} from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { getApp } from "@/lib/auth-db/apps/app-registry/get-app";

/**
 * Per-app scope allowances (APP_API_SCOPE_POLICIES / APP_API_SCOPE_GRANTS,
 * migration 00047): which of an API server's scopes a client application
 * may be granted, separately for the scopes users delegate to it
 * (`user`, unrestricted unless the connection's policy restricts it) and
 * for its own service account on the client_credentials grant
 * (`service_account`, none unless listed). Dynamically registered clients
 * have no connection: they may be granted the scopes flagged
 * `allow_dynamic_clients`, while their API server allows dynamic clients.
 */

/** Thrown by {@link setAppApiScopePolicy} for values the API server does not define. */
export class UnknownApiScopesError extends Error {
  public readonly scopes: readonly string[];
  public constructor(scopes: readonly string[]) {
    super(`The API server does not define these scopes: ${scopes.join(", ")}`);
    this.name = "UnknownApiScopesError";
    this.scopes = scopes;
  }
}

/** Thrown by {@link setAppApiScopePolicy} when the app is not connected to the API server. */
export class AppNotConnectedForScopesError extends Error {
  public constructor(client_app_id: string, api_server_id: string) {
    super(`App '${client_app_id}' is not connected to API server '${api_server_id}'`);
    this.name = "AppNotConnectedForScopesError";
  }
}

function assertIds(client_app_id: string, api_server_id: string): void {
  if (!appIdSchema.safeParse(client_app_id).success) {
    throw new TypeError("Invalid client app ID!");
  }
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }
}

async function isConnected(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  client_app_id: string,
  api_server_id: string,
): Promise<boolean> {
  const row = await db
    .selectFrom("apps_to_apis_permissions")
    .where("client_app_id", "=", client_app_id)
    .where("api_server_id", "=", api_server_id)
    .select(["client_app_id"])
    .executeTakeFirst();
  return row !== undefined && row !== null;
}

/**
 * The scope allowances of a connection, as scope values. A connection
 * without a policy row is unrestricted for users and grants its service
 * account nothing.
 */
export async function getAppApiScopePolicy(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  client_app_id: AppId,
  api_server_id: ApiServerId,
): Promise<AppApiScopePolicy> {
  assertIds(client_app_id, api_server_id);
  const [policy, grants] = await Promise.all([
    db
      .selectFrom("app_api_scope_policies")
      .where("client_app_id", "=", client_app_id)
      .where("api_server_id", "=", api_server_id)
      .select(["restrict_user_scopes"])
      .executeTakeFirst(),
    db
      .selectFrom("app_api_scope_grants")
      .innerJoin(
        "api_server_scopes",
        "api_server_scopes.api_server_scope_id",
        "app_api_scope_grants.api_server_scope_id",
      )
      .where("app_api_scope_grants.client_app_id", "=", client_app_id)
      .where("app_api_scope_grants.api_server_id", "=", api_server_id)
      .orderBy("api_server_scopes.scope", "asc")
      .select(["app_api_scope_grants.grantee", "api_server_scopes.scope"])
      .execute(),
  ]);
  return {
    restrict_user_scopes: policy?.restrict_user_scopes === true,
    user_scopes: grants.filter((g) => g.grantee === "user").map((g) => g.scope),
    service_account_scopes: grants
      .filter((g) => g.grantee === "service_account")
      .map((g) => g.scope),
  };
}

export interface SetAppApiScopePolicyOptions {
  client_app_id: AppId;
  api_server_id: ApiServerId;
  restrict_user_scopes: boolean;
  user_scopes: readonly string[];
  service_account_scopes: readonly string[];
  updated_by: string | null;
}

/**
 * Replaces the scope allowances of a connection.
 *
 * @throws AppNotConnectedForScopesError when the app is not connected.
 * @throws UnknownApiScopesError for values the API server does not define.
 */
export async function setAppApiScopePolicy(
  db: Kysely<AuthDatabase>,
  {
    client_app_id,
    api_server_id,
    restrict_user_scopes,
    user_scopes,
    service_account_scopes,
    updated_by,
  }: SetAppApiScopePolicyOptions,
): Promise<AppApiScopePolicy> {
  assertIds(client_app_id, api_server_id);
  return await db.transaction().execute(async (trx) => {
    if (!(await isConnected(trx, client_app_id, api_server_id))) {
      throw new AppNotConnectedForScopesError(client_app_id, api_server_id);
    }
    const defined = await trx
      .selectFrom("api_server_scopes")
      .where("api_server_id", "=", api_server_id)
      .select(["api_server_scope_id", "scope"])
      .execute();
    const idByValue = new Map(defined.map((d) => [d.scope, d.api_server_scope_id]));
    const unknown = [...new Set([...user_scopes, ...service_account_scopes])].filter(
      (value) => !idByValue.has(value),
    );
    if (unknown.length > 0) {
      throw new UnknownApiScopesError(unknown);
    }

    const now = Date.now();
    await trx
      .insertInto("app_api_scope_policies")
      .values({
        client_app_id,
        api_server_id,
        restrict_user_scopes,
        updated_at: now,
        updated_by,
      })
      .onConflict((oc) =>
        oc.columns(["client_app_id", "api_server_id"]).doUpdateSet({
          restrict_user_scopes,
          updated_at: now,
          updated_by,
        }),
      )
      .execute();

    await trx
      .deleteFrom("app_api_scope_grants")
      .where("client_app_id", "=", client_app_id)
      .where("api_server_id", "=", api_server_id)
      .execute();
    const rows = [
      ...user_scopes.map((value) => ({ value, grantee: "user" as const })),
      ...service_account_scopes.map((value) => ({
        value,
        grantee: "service_account" as const,
      })),
    ].map(({ value, grantee }) => ({
      client_app_id,
      api_server_id,
      api_server_scope_id: idByValue.get(value)!,
      grantee,
      created_at: now,
      created_by: updated_by,
    }));
    if (rows.length > 0) {
      await trx.insertInto("app_api_scope_grants").values(rows).execute();
    }
    return await getAppApiScopePolicy(trx, client_app_id, api_server_id);
  });
}

/**
 * The scope values of `api_server_id` that `client_app_id` may currently be
 * granted for `grantee`:
 *
 * - connected app, `user`: every defined scope, or only the connection's
 *   `user` allowances when its policy restricts them;
 * - connected app, `service_account`: the connection's `service_account`
 *   allowances (none by default);
 * - unconnected dynamically registered client, `user`: the scopes flagged
 *   `allow_dynamic_clients`, while the API server allows dynamic clients;
 * - anything else: none.
 */
export async function listGrantableApiScopeValues(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  {
    client_app_id,
    api_server_id,
    grantee,
  }: { client_app_id: AppId; api_server_id: ApiServerId; grantee: ApiScopeGrantee },
): Promise<string[]> {
  assertIds(client_app_id, api_server_id);
  const defined = await db
    .selectFrom("api_server_scopes")
    .where("api_server_id", "=", api_server_id)
    .select(["api_server_scope_id", "scope", "allow_dynamic_clients"])
    .execute();
  if (defined.length === 0) {
    return [];
  }

  if (!(await isConnected(db, client_app_id, api_server_id))) {
    if (grantee !== "user") {
      return [];
    }
    const [client_app, api_server] = await Promise.all([
      getApp(db, client_app_id),
      db
        .selectFrom("api_servers")
        .where("api_server_id", "=", api_server_id)
        .select(["allow_dynamic_clients"])
        .executeTakeFirst(),
    ]);
    if (
      !client_app ||
      !isDynamicallyRegisteredClient(client_app) ||
      api_server?.allow_dynamic_clients !== true
    ) {
      return [];
    }
    return defined.filter((d) => d.allow_dynamic_clients === true).map((d) => d.scope);
  }

  if (grantee === "user") {
    const policy = await db
      .selectFrom("app_api_scope_policies")
      .where("client_app_id", "=", client_app_id)
      .where("api_server_id", "=", api_server_id)
      .select(["restrict_user_scopes"])
      .executeTakeFirst();
    if (policy?.restrict_user_scopes !== true) {
      return defined.map((d) => d.scope);
    }
  }

  const granted = await db
    .selectFrom("app_api_scope_grants")
    .where("client_app_id", "=", client_app_id)
    .where("api_server_id", "=", api_server_id)
    .where("grantee", "=", grantee)
    .select(["api_server_scope_id"])
    .execute();
  const grantedIds = new Set(granted.map((g) => g.api_server_scope_id));
  return defined
    .filter((d) => grantedIds.has(d.api_server_scope_id))
    .map((d) => d.scope);
}
