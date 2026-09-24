import "server-only";
import type { Hono } from "@schemavaults/openapi-operations";
import ServerlessDatabase from "@/lib/auth-db/serverless-database";
import { isCronAuthorizationHeaderValid } from "@/lib/CronSecret";
import { RedisCache } from "@/lib/redis";
import { DAILY_REPORT_ROUTE } from "./operation";
import sendDailyReportHandler from "./sendDailyReportHandler";

/**
 * Pre-migration behaviour of this route: a request carrying the
 * deployment's cron secret (`Authorization: Bearer <CRON_SECRET>`) runs the
 * report without any session, everything else goes through the admin
 * guard. The runtime cannot express "secret OR admin session" with the
 * shared resolvers, so the secret check stays a Hono middleware registered
 * ahead of the operations: it answers cron callers itself and lets every
 * other request fall through to the session-guarded operation.
 */
export function configureCronSecretBypass(app: Hono): void {
  app.use(DAILY_REPORT_ROUTE, async (c, next) => {
    if (!isCronAuthorizationHeaderValid(c.req.header("authorization"))) {
      await next();
      return;
    }
    await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();
    await using redis = RedisCache.createConnection();
    return await sendDailyReportHandler({ dbh, redis });
  });
}
