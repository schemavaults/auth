import "server-only";
import { getAppEnvironment, type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { ServerlessDatabase } from "@/lib/auth-db/serverless-database";
import { RedisCache } from "@/lib/redis";
import shouldEnableDebug from "@/lib/should-enable-debug";
import type { AuthServerApiContext } from "./context";

/**
 * {@link AuthServerApiContext} implementation whose database handle and
 * Redis connection are opened on first use, so public operations that need
 * neither (`GET /api/environment`, ...) pay for neither, while the auth
 * resolvers and the handler of a guarded operation share one of each.
 */
export class AuthServerRequestContext implements AuthServerApiContext, AsyncDisposable {
  public readonly environment: SchemaVaultsAppEnvironment;
  public readonly debug: boolean;
  private _dbh: ServerlessDatabase | null = null;
  private _redis: RedisCache | null = null;

  public constructor(environment: SchemaVaultsAppEnvironment = getAppEnvironment()) {
    this.environment = environment;
    this.debug = shouldEnableDebug(environment);
  }

  public get dbh(): ServerlessDatabase {
    this._dbh ??= ServerlessDatabase.createDBH();
    return this._dbh;
  }

  public get db(): Kysely<AuthDatabase> {
    return this.dbh.db;
  }

  public get redis(): RedisCache {
    this._redis ??= RedisCache.createConnection();
    return this._redis;
  }

  /** The database handle if one was opened during the request. */
  public get openedDatabase(): ServerlessDatabase | null {
    return this._dbh;
  }

  /** Releases whatever was opened; safe to call more than once. */
  public async dispose(): Promise<void> {
    const redis = this._redis;
    const dbh = this._dbh;
    this._redis = null;
    this._dbh = null;
    const failures: unknown[] = [];
    if (redis) {
      try {
        await redis[Symbol.asyncDispose]();
      } catch (e: unknown) {
        failures.push(e);
      }
    }
    if (dbh) {
      try {
        await dbh[Symbol.asyncDispose]();
      } catch (e: unknown) {
        failures.push(e);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, "Failed to release request resources");
    }
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.dispose();
  }
}
