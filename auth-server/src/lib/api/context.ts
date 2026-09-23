import "server-only";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { UserData } from "@schemavaults/auth-common";
import type { Kysely } from "@schemavaults/dbh";
import { createOperationDefiner } from "@schemavaults/openapi-operations";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { ServerlessDatabase } from "@/lib/auth-db/serverless-database";
import type { RedisCache } from "@/lib/redis";

/**
 * Per-request context handed to every operation handler as `ctx.context`
 * and to every auth resolver. Built by `apiRouteHandlers()` in ./app.ts
 * (see ./request-context.ts): the database handle and the Redis connection
 * are opened on first access and released once the response was produced,
 * mirroring the `await using dbh/redis` the old route guards did per
 * request.
 */
export interface AuthServerApiContext {
  readonly environment: SchemaVaultsAppEnvironment;
  /** `shouldEnableDebug(environment)`. */
  readonly debug: boolean;
  /** Lazily opened database handle (shared with the auth resolvers). */
  readonly dbh: ServerlessDatabase;
  /** Shortcut for `dbh.db`. */
  readonly db: Kysely<AuthDatabase>;
  /** Lazily opened Redis connection. */
  readonly redis: RedisCache;
}

/**
 * `defineOperation` bound to the auth server's request context and the
 * `UserData` its credentials resolve to, so handlers get typed
 * `ctx.context` and `ctx.auth.user`.
 */
export const defineOperation = createOperationDefiner<AuthServerApiContext, UserData>();

export type AuthServerOperation = ReturnType<typeof defineOperation>;
