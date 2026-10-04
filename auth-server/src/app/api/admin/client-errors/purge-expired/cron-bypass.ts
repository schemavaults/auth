import "server-only";
import type { Hono } from "@schemavaults/openapi-operations";
import ServerlessDatabase from "@/lib/auth-db/serverless-database";
import { isCronAuthorizationHeaderValid } from "@/lib/CronSecret";
import { RedisCache } from "@/lib/redis";
import { PURGE_EXPIRED_CLIENT_ERRORS_ROUTE, purgeExpiredClientErrorsHandler } from "./purge-handler";

/**
 * Lets the scheduled job run the purge without a session: a request
 * carrying the deployment's cron secret (`Authorization: Bearer
 * <CRON_SECRET>`) is answered here, everything else falls through to the
 * admin-guarded operations. Same arrangement as
 * `/api/admin/send-daily-report`.
 */
export function configurePurgeCronSecretBypass(app: Hono): void {
  app.use(PURGE_EXPIRED_CLIENT_ERRORS_ROUTE, async (c, next) => {
    if (!isCronAuthorizationHeaderValid(c.req.header("authorization"))) {
      await next();
      return;
    }
    await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();
    await using redis = RedisCache.createConnection();
    return await purgeExpiredClientErrorsHandler({ db: dbh.db, redis: redis.client });
  });
}
