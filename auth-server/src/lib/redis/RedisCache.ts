import "server-only";

import Redis from "ioredis";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export interface RedisCacheConnectionOptions {
  /**
   * Fail commands as soon as the first connection attempt fails, instead of
   * holding them through ioredis' default 20 reconnect attempts (~10s). For
   * best-effort cache reads that fall back to Postgres or a default, e.g.
   * on page renders, which must not stall while Redis is down.
   */
  fail_fast?: boolean;
}

export class RedisCache implements AsyncDisposable {
  public readonly client: Redis;

  private static resolveRedisUrl(
    environment: SchemaVaultsAppEnvironment,
  ): string {
    if (environment === "development") {
      return "redis://localhost:6379";
    } else if (environment === "test") {
      return "redis://schemavaults-auth-redis:6379";
    } else if (environment === "production") {
      const url = process.env.REDIS_URL;
      if (!url) {
        throw new Error(
          "REDIS_URL environment variable is not set in production!",
        );
      }
      return url;
    } else {
      throw new Error(
        "Not configured to resolve Redis URL in this environment!",
      );
    }
  }

  private constructor(opts: RedisCacheConnectionOptions) {
    const environment = getAppEnvironment();
    const url = RedisCache.resolveRedisUrl(environment);
    this.client =
      opts.fail_fast === true
        ? new Redis(url, { maxRetriesPerRequest: 0 })
        : new Redis(url);
  }

  public static createConnection(
    opts: RedisCacheConnectionOptions = {},
  ): RedisCache {
    return new RedisCache(opts);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.client.quit();
  }
}

export default RedisCache;
