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
  type ApiServerScope,
} from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { ConflictError } from "@/lib/error/ConflictError";
import isUniqueViolation from "@/lib/auth-db/is-unique-violation";

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
    .selectAll()
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
  { api_server_id, scope, description, created_by }: CreateApiServerScopeOptions,
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
 * Changes a scope's description. Returns the updated scope, or null when
 * the API server defines no scope with that id.
 */
export async function updateApiServerScopeDescription(
  db: Kysely<AuthDatabase>,
  api_server_id: ApiServerId,
  api_server_scope_id: string,
  description: string,
): Promise<ApiServerScope | null> {
  assertApiServerId(api_server_id);
  const parsed_description = apiScopeDescriptionSchema.safeParse(description);
  if (!parsed_description.success) {
    throw new TypeError("Invalid API scope description", {
      cause: parsed_description.error,
    });
  }
  const row = await db
    .updateTable("api_server_scopes")
    .set({ description: parsed_description.data })
    .where("api_server_id", "=", api_server_id)
    .where("api_server_scope_id", "=", api_server_scope_id)
    .returningAll()
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
