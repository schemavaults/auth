import "server-only";

import Redis from "ioredis";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

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

  private constructor() {
    const environment = getAppEnvironment();
    const url = RedisCache.resolveRedisUrl(environment);
    this.client = new Redis(url);
  }

  public static createConnection(): RedisCache {
    return new RedisCache();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.client.quit();
  }
}

export default RedisCache;
