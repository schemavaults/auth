import "server-only";
import type { Hono } from "@schemavaults/openapi-operations";
import ServerlessDatabase from "@/lib/auth-db/serverless-database";
import { isCronAuthorizationHeaderValid } from "@/lib/CronSecret";
import { RedisCache } from "@/lib/redis";
import {
  ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE,
  enforceOrganizationMfaRequirementsHandler,
} from "./enforce-handler";

/**
 * Lets the scheduled job run the enforcement without a session: a request
 * carrying the deployment's cron secret (`Authorization: Bearer
 * <CRON_SECRET>`) is answered here, everything else falls through to the
 * admin-guarded operations. Same arrangement as
 * `/api/admin/client-errors/purge-expired`.
 */
export function configureEnforceCronSecretBypass(app: Hono): void {
  app.use(ENFORCE_ORGANIZATION_MFA_REQUIREMENTS_ROUTE, async (c, next) => {
    if (!isCronAuthorizationHeaderValid(c.req.header("authorization"))) {
      await next();
      return;
    }
    await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH();
    await using redis = RedisCache.createConnection();
    return await enforceOrganizationMfaRequirementsHandler({ db: dbh.db, redis });
  });
}
