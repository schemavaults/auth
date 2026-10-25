import "server-only";
import {
  apiServerIdSchema,
  isHardcodedApiServerId,
  type ApiServerId,
} from "@schemavaults/app-definitions";
import {
  MAX_API_SCOPES_PER_API_SERVER,
  apiScopeDescriptionSchema,
  apiScopeValueSchema,
  apiServerScopeSchema,
  isOidcReservedScope,
  syncApiServerScopesRequestSchema,
  type ApiScopeManifestEntry,
  type ApiServerScope,
  type ApiServerScopeSyncResult,
} from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { ConflictError } from "@/lib/error/ConflictError";
import isUniqueViolation from "@/lib/auth-db/is-unique-violation";
import { planApiServerScopeSync } from "./plan-api-server-scope-sync";

/**
 * API scopes: the OAuth 2.0 scope values an API server defines for itself
 * (API_SERVER_SCOPES, migration 00046). The token flows grant the ones an
 * authorization request asks for when it names the API server as its RFC
 * 8707 `resource` (see `@/lib/oauth2/api-scopes`). Hardcoded API servers
 * define none.
 */

function parseApiServerScopeFromDb(row: object): ApiServerScope {
  if (!("created_at" in row)) {
    throw new Error("Missing API server scope creation time");
  }
  const created_at: number =
    typeof row.created_at === "string"
      ? parseInt(row.created_at)
      : Number(row.created_at);
  if (isNaN(created_at)) {
    throw new Error("Failed to parse API server scope creation time from database");
  }
  const parsed = apiServerScopeSchema.safeParse({ ...row, created_at });
  if (!parsed.success) {
    console.error(parsed.error);
    throw new Error("Failed to parse API server scope from database!");
  }
  return parsed.data;
}

/**
 * The columns read back. Listed explicitly (not SELECT *) so a column added
 * later cannot break the strict parse of older code.
 */
const SCOPE_COLUMNS = [
  "api_server_scope_id",
  "api_server_id",
  "scope",
  "description",
  "allow_dynamic_clients",
  "created_at",
  "created_by",
] as const;

function assertApiServerId(api_server_id: string): asserts api_server_id is ApiServerId {
  if (!apiServerIdSchema.safeParse(api_server_id).success) {
    throw new TypeError("Invalid API server ID!");
  }
}

/** Every scope the API server defines, oldest first. */
export async function listApiServerScopes(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  api_server_id: ApiServerId,
): Promise<ApiServerScope[]> {
  assertApiServerId(api_server_id);
  if (isHardcodedApiServerId(api_server_id)) {
    return [];
  }
  const rows = await db
    .selectFrom("api_server_scopes")
    .where("api_server_id", "=", api_server_id)
    .orderBy("created_at", "asc")
    .orderBy("scope", "asc")
    .limit(MAX_API_SCOPES_PER_API_SERVER)
    .select(SCOPE_COLUMNS)
    .execute();
  return rows.map(parseApiServerScopeFromDb);
}

/**
 * The scope values the API server defines: what a grant whose `resource`
 * resolved to it may include besides the OIDC scopes.
 */
export async function listApiServerScopeValues(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  api_server_id: ApiServerId,
): Promise<string[]> {
  assertApiServerId(api_server_id);
  if (isHardcodedApiServerId(api_server_id)) {
    return [];
  }
  const rows = await db
    .selectFrom("api_server_scopes")
    .where("api_server_id", "=", api_server_id)
    .limit(MAX_API_SCOPES_PER_API_SERVER)
    .select(["scope"])
    .execute();
  return rows
    .map((row) => row.scope)
    .filter((scope) => typeof scope === "string" && !isOidcReservedScope(scope));
}

export interface CreateApiServerScopeOptions {
  api_server_id: ApiServerId;
  scope: string;
  description: string;
  /** Whether dynamically registered clients may be granted it (default true). */
  allow_dynamic_clients?: boolean;
  created_by: string | null;
}

/**
 * Defines a new scope on a (non-hardcoded) API server.
 *
 * @throws ConflictError when the API server already defines the scope, or
 * already defines {@link MAX_API_SCOPES_PER_API_SERVER} scopes.
 * @throws TypeError for an invalid id, scope value or description.
 */
export async function createApiServerScope(
  db: Kysely<AuthDatabase>,
  {
    api_server_id,
    scope,
    description,
    allow_dynamic_clients = true,
    created_by,
  }: CreateApiServerScopeOptions,
): Promise<ApiServerScope> {
  assertApiServerId(api_server_id);
  if (isHardcodedApiServerId(api_server_id)) {
    throw new TypeError("Hardcoded API servers cannot define API scopes");
  }
  const parsed_scope = apiScopeValueSchema.safeParse(scope);
  if (!parsed_scope.success) {
    throw new TypeError("Invalid API scope value", { cause: parsed_scope.error });
  }
  const parsed_description = apiScopeDescriptionSchema.safeParse(description);
  if (!parsed_description.success) {
    throw new TypeError("Invalid API scope description", {
      cause: parsed_description.error,
    });
  }

  const row: ApiServerScope = {
    api_server_scope_id: crypto.randomUUID(),
    api_server_id,
    scope: parsed_scope.data,
    description: parsed_description.data,
    allow_dynamic_clients,
    created_at: Date.now(),
    created_by,
  };

  try {
    return await db.transaction().execute(async (trx) => {
      // Lock the API server row so concurrent creations cannot overshoot
      // the per-server limit between the count and the insert.
      await trx
        .selectFrom("api_servers")
        .where("api_server_id", "=", api_server_id)
        .select(["api_server_id"])
        .forUpdate()
        .executeTakeFirst();
      const count = await trx
        .selectFrom("api_server_scopes")
        .where("api_server_id", "=", api_server_id)
        .select((eb) => eb.fn.countAll<string | number | bigint>().as("count"))
        .executeTakeFirstOrThrow();
      if (Number(count.count) >= MAX_API_SCOPES_PER_API_SERVER) {
        throw new ConflictError(
          `An API server cannot define more than ${MAX_API_SCOPES_PER_API_SERVER} scopes`,
        );
      }
      await trx.insertInto("api_server_scopes").values(row).execute();
      return row;
    });
  } catch (e: unknown) {
    if (e instanceof ConflictError) throw e;
    if (isUniqueViolation(e)) {
      throw new ConflictError("This API server already defines that scope");
    }
    throw e;
  }
}

/**
 * Changes a scope's description and/or whether dynamic clients may be
 * granted it. Returns the updated scope, or null when the API server
 * defines no scope with that id.
 */
export async function updateApiServerScope(
  db: Kysely<AuthDatabase>,
  api_server_id: ApiServerId,
  api_server_scope_id: string,
  update: { description?: string; allow_dynamic_clients?: boolean },
): Promise<ApiServerScope | null> {
  assertApiServerId(api_server_id);
  const set: { description?: string; allow_dynamic_clients?: boolean } = {};
  if (update.description !== undefined) {
    const parsed_description = apiScopeDescriptionSchema.safeParse(update.description);
    if (!parsed_description.success) {
      throw new TypeError("Invalid API scope description", {
        cause: parsed_description.error,
      });
    }
    set.description = parsed_description.data;
  }
  if (typeof update.allow_dynamic_clients === "boolean") {
    set.allow_dynamic_clients = update.allow_dynamic_clients;
  }
  if (Object.keys(set).length === 0) {
    throw new TypeError("Nothing to update");
  }
  const row = await db
    .updateTable("api_server_scopes")
    .set(set)
    .where("api_server_id", "=", api_server_id)
    .where("api_server_scope_id", "=", api_server_scope_id)
    .returning(SCOPE_COLUMNS)
    .executeTakeFirst();
  return row ? parseApiServerScopeFromDb(row) : null;
}

/**
 * Deletes a scope. Tokens already carrying it keep it until they expire;
 * refresh grants stop carrying it forward. Returns whether a row was
 * deleted.
 */
export async function deleteApiServerScope(
  db: Kysely<AuthDatabase>,
  api_server_id: ApiServerId,
  api_server_scope_id: string,
): Promise<boolean> {
  assertApiServerId(api_server_id);
  const result = await db
    .deleteFrom("api_server_scopes")
    .where("api_server_id", "=", api_server_id)
    .where("api_server_scope_id", "=", api_server_scope_id)
    .executeTakeFirst();
  return result.numDeletedRows > BigInt(0);
}

export interface SyncApiServerScopesOptions {
  api_server_id: ApiServerId;
  /** The API server's whole scope list (a parsed manifest). */
  scopes: readonly ApiScopeManifestEntry[];
  /** Plan and report without writing. */
  dry_run: boolean;
}

/**
 * Brings the API server's scopes in line with the list its resource server
 * declares (`PUT /api/resource-server/apis/{api_server_id}/scopes`): creates
 * the missing scopes and updates the changed ones in one transaction, under
 * the same API server row lock as {@link createApiServerScope}. Never
 * deletes; defined scopes the list leaves out come back as
 * `not_in_manifest`. See `planApiServerScopeSync` for the rule. A dry run
 * plans (and checks the limit) without writing. Synced scopes have no
 * `created_by`.
 *
 * @returns what was (or would be) done, or null when no such API server
 * is registered.
 * @throws ConflictError when the created scopes would take the API server
 * over {@link MAX_API_SCOPES_PER_API_SERVER} scopes.
 * @throws TypeError for an invalid id, a hardcoded API server, or a list
 * that fails `syncApiServerScopesRequestSchema`.
 */
export async function syncApiServerScopes(
  db: Kysely<AuthDatabase>,
  { api_server_id, scopes, dry_run }: SyncApiServerScopesOptions,
): Promise<ApiServerScopeSyncResult | null> {
  assertApiServerId(api_server_id);
  if (isHardcodedApiServerId(api_server_id)) {
    throw new TypeError("Hardcoded API servers cannot define API scopes");
  }
  const parsed = syncApiServerScopesRequestSchema.shape.scopes.safeParse(scopes);
  if (!parsed.success) {
    throw new TypeError("Invalid API scope list", { cause: parsed.error });
  }
  const entries: readonly ApiScopeManifestEntry[] = parsed.data;

  const run = async (
    trx: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
    lock: boolean,
  ): Promise<ApiServerScopeSyncResult | null> => {
    const apiServerQuery = trx
      .selectFrom("api_servers")
      .where("api_server_id", "=", api_server_id)
      .select(["api_server_id"]);
    // Locked so concurrent syncs and creations cannot overshoot the
    // per-server limit or insert the same scope twice.
    const apiServer = lock
      ? await apiServerQuery.forUpdate().executeTakeFirst()
      : await apiServerQuery.executeTakeFirst();
    if (!apiServer) return null;

    const rows = await trx
      .selectFrom("api_server_scopes")
      .where("api_server_id", "=", api_server_id)
      .orderBy("created_at", "asc")
      .orderBy("scope", "asc")
      .select(SCOPE_COLUMNS)
      .execute();
    const existing: ApiServerScope[] = rows.map(parseApiServerScopeFromDb);

    const plan = planApiServerScopeSync(existing, entries);
    if (existing.length + plan.created.length > MAX_API_SCOPES_PER_API_SERVER) {
      throw new ConflictError(
        `An API server cannot define more than ${MAX_API_SCOPES_PER_API_SERVER} scopes: it defines ${existing.length} and the list adds ${plan.created.length}`,
      );
    }

    if (!dry_run) {
      if (plan.created.length > 0) {
        const now: number = Date.now();
        await trx
          .insertInto("api_server_scopes")
          .values(
            plan.created.map(
              (scope, index): ApiServerScope => ({
                api_server_scope_id: crypto.randomUUID(),
                api_server_id,
                scope: scope.scope,
                description: scope.description,
                allow_dynamic_clients: scope.allow_dynamic_clients,
                // One millisecond apart so listings (oldest first) keep the
                // manifest's order.
                created_at: now + index,
                created_by: null,
              }),
            ),
          )
          .execute();
      }
      for (const update of plan.updated) {
        await trx
          .updateTable("api_server_scopes")
          .set({
            description: update.description,
            allow_dynamic_clients: update.allow_dynamic_clients,
          })
          .where("api_server_id", "=", api_server_id)
          .where("api_server_scope_id", "=", update.api_server_scope_id)
          .execute();
      }
    }

    return {
      api_server_id,
      dry_run,
      created: [...plan.created],
      updated: plan.updated.map(({ scope, description, allow_dynamic_clients, previous }) => ({
        scope,
        description,
        allow_dynamic_clients,
        previous,
      })),
      unchanged: [...plan.unchanged],
      not_in_manifest: [...plan.not_in_manifest],
    };
  };

  if (dry_run) {
    return await run(db, false);
  }
  try {
    return await db.transaction().execute((trx) => run(trx, true));
  } catch (e: unknown) {
    if (e instanceof ConflictError) throw e;
    if (isUniqueViolation(e)) {
      throw new ConflictError("A listed scope was defined concurrently; retry the sync");
    }
    throw e;
  }
}
