import "server-only";
import {
  apiServerIdSchema,
  appIdSchema,
  type ApiServerId,
  type AppId,
} from "@schemavaults/app-definitions";
import type { ConnectedApp, ConnectedAppScope } from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import isValidUuid from "@/lib/is-valid-uuid";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";

/**
 * Per-scope user consent (USER_APP_SCOPE_CONSENTS, migration 00047): the API
 * scopes each user granted each authorized client app. Consent to the app
 * itself stays the AUTHORIZED_APPS row (it covers sign-in and the OIDC
 * scopes, as before); a consent row can only exist alongside it and goes
 * with it when the user revokes the app.
 */

type Db = Kysely<AuthDatabase> | Transaction<AuthDatabase>;

function toNumber(value: unknown): number {
  return typeof value === "string" ? parseInt(value, 10) : Number(value);
}

function assertUidAndApp(uid: string, client_app_id: string): void {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
  if (!appIdSchema.safeParse(client_app_id).success) {
    throw new TypeError("Invalid client app ID!");
  }
}

/** The scope values of `api_server_id` the user granted the app. */
export async function listConsentedApiScopeValues(
  db: Db,
  {
    uid,
    client_app_id,
    api_server_id,
  }: { uid: string; client_app_id: AppId; api_server_id: ApiServerId },
): Promise<string[]> {
  assertUidAndApp(uid, client_app_id);
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }
  const rows = await db
    .selectFrom("user_app_scope_consents")
    .innerJoin(
      "api_server_scopes",
      "api_server_scopes.api_server_scope_id",
      "user_app_scope_consents.api_server_scope_id",
    )
    .where("user_app_scope_consents.uid", "=", uid)
    .where("user_app_scope_consents.client_app_id", "=", client_app_id)
    .where("user_app_scope_consents.api_server_id", "=", api_server_id)
    .select(["api_server_scopes.scope"])
    .execute();
  return rows.map((row) => row.scope);
}

/**
 * Records the user's consent to API scopes (values of `api_server_id`) for
 * an app they authorized. Unknown values are ignored; already-granted ones
 * keep their original time. Returns the values recorded now.
 */
export async function recordApiScopeConsents(
  db: Db,
  {
    uid,
    client_app_id,
    api_server_id,
    scopes,
  }: {
    uid: string;
    client_app_id: AppId;
    api_server_id: ApiServerId;
    scopes: readonly string[];
  },
): Promise<string[]> {
  assertUidAndApp(uid, client_app_id);
  if (scopes.length === 0) {
    return [];
  }
  const defined = await db
    .selectFrom("api_server_scopes")
    .where("api_server_id", "=", api_server_id)
    .where("scope", "in", [...scopes])
    .select(["api_server_scope_id", "scope"])
    .execute();
  if (defined.length === 0) {
    return [];
  }
  const now = Date.now();
  const inserted = await db
    .insertInto("user_app_scope_consents")
    .values(
      defined.map((d) => ({
        uid,
        client_app_id,
        api_server_id,
        api_server_scope_id: d.api_server_scope_id,
        granted_at: now,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["uid", "client_app_id", "api_server_scope_id"]).doNothing(),
    )
    .returning(["api_server_scope_id"])
    .execute();
  const insertedIds = new Set(inserted.map((row) => row.api_server_scope_id));
  return defined
    .filter((d) => insertedIds.has(d.api_server_scope_id))
    .map((d) => d.scope);
}

/**
 * Withdraws the user's consent to one API scope for an app. Returns the API
 * server the scope belongs to, or null when there was no such consent.
 */
export async function revokeApiScopeConsent(
  db: Db,
  {
    uid,
    client_app_id,
    api_server_scope_id,
  }: { uid: string; client_app_id: AppId; api_server_scope_id: string },
): Promise<{ api_server_id: ApiServerId; scope: string } | null> {
  assertUidAndApp(uid, client_app_id);
  if (!isValidUuid(api_server_scope_id)) {
    throw new TypeError("Invalid API scope ID!");
  }
  const row = await db
    .deleteFrom("user_app_scope_consents")
    .where("uid", "=", uid)
    .where("client_app_id", "=", client_app_id)
    .where("api_server_scope_id", "=", api_server_scope_id)
    .returning(["api_server_id"])
    .executeTakeFirst();
  if (!row) {
    return null;
  }
  const scope = await db
    .selectFrom("api_server_scopes")
    .where("api_server_scope_id", "=", api_server_scope_id)
    .select(["scope"])
    .executeTakeFirst();
  return { api_server_id: row.api_server_id, scope: scope?.scope ?? "" };
}

/**
 * The third-party applications the user authorized (the auth server's own
 * app is never listed), newest first, with the API scopes they were granted
 * and when each last received a token for the user.
 */
export async function listConnectedAppsForUser(
  db: Db,
  uid: string,
): Promise<ConnectedApp[]> {
  if (!isValidUuid(uid)) {
    throw new TypeError("Invalid uid: expected a valid UUID");
  }
  const auth_app_id = getAuthServerAppId();
  const [apps, scopes, lastUsed] = await Promise.all([
    db
      .selectFrom("authorized_apps")
      .innerJoin("apps", "apps.app_id", "authorized_apps.app_id")
      .where("authorized_apps.uid", "=", uid)
      .where("authorized_apps.app_id", "!=", auth_app_id)
      .orderBy("authorized_apps.authorized_at", "desc")
      .select([
        "authorized_apps.app_id",
        "authorized_apps.authorized_at",
        "apps.app_name",
        "apps.app_description",
      ])
      .execute(),
    db
      .selectFrom("user_app_scope_consents")
      .innerJoin(
        "api_server_scopes",
        "api_server_scopes.api_server_scope_id",
        "user_app_scope_consents.api_server_scope_id",
      )
      .innerJoin(
        "api_servers",
        "api_servers.api_server_id",
        "user_app_scope_consents.api_server_id",
      )
      .where("user_app_scope_consents.uid", "=", uid)
      .orderBy("api_servers.api_server_name", "asc")
      .orderBy("api_server_scopes.scope", "asc")
      .select([
        "user_app_scope_consents.client_app_id",
        "user_app_scope_consents.api_server_id",
        "user_app_scope_consents.api_server_scope_id",
        "user_app_scope_consents.granted_at",
        "api_server_scopes.scope",
        "api_server_scopes.description",
        "api_servers.api_server_name",
      ])
      .execute(),
    db
      .selectFrom("issued_tokens")
      .where("uid", "=", uid)
      .groupBy("client_app_id")
      .select((eb) => ["client_app_id", eb.fn.max("issued_at").as("last_used_at")])
      .execute(),
  ]);

  const scopesByApp = new Map<string, ConnectedAppScope[]>();
  for (const row of scopes) {
    const list = scopesByApp.get(row.client_app_id) ?? [];
    list.push({
      api_server_id: row.api_server_id,
      api_server_name: row.api_server_name,
      api_server_scope_id: row.api_server_scope_id,
      scope: row.scope,
      description: row.description,
      granted_at: toNumber(row.granted_at),
    });
    scopesByApp.set(row.client_app_id, list);
  }
  const lastUsedByApp = new Map<string, number>();
  for (const row of lastUsed) {
    if (row.last_used_at !== null && row.last_used_at !== undefined) {
      lastUsedByApp.set(row.client_app_id, toNumber(row.last_used_at));
    }
  }

  return apps.map((app) => ({
    app_id: app.app_id,
    app_name: app.app_name,
    app_description: app.app_description ?? "",
    authorized_at: toNumber(app.authorized_at),
    last_used_at: lastUsedByApp.get(app.app_id) ?? null,
    api_scopes: scopesByApp.get(app.app_id) ?? [],
  }));
}
