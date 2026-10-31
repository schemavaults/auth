import "server-only";
import type { UserData } from "@schemavaults/auth-common";
import {
  OperationError,
  type AuthPrincipal,
  type AuthResolver,
} from "@schemavaults/openapi-operations";
import { isCronAuthorizationHeaderValid } from "@/lib/CronSecret";
import type { AuthServerApiContext } from "../context";
import { cronSecretScheme } from "../auth-schemes";

/**
 * Resolves `Authorization: Bearer <CRON_SECRET>` (compared in constant time)
 * to a non-user principal for scheduled-job operations.
 * - no Authorization header → null (401 from the runtime);
 * - any other header value, an administrator's access token included, or
 *   any value at all while `CRON_SECRET` is unset → 401.
 */
export const cronSecretResolver: AuthResolver<UserData, AuthServerApiContext> = (
  c,
  scheme,
): AuthPrincipal<UserData> | null => {
  const authorization = c.req.header("authorization");
  if (typeof authorization !== "string" || authorization.length === 0) return null;
  if (!isCronAuthorizationHeaderValid(authorization)) {
    throw new OperationError(
      401,
      { error: "invalid_cron_secret", message: "Invalid cron secret" },
      { "WWW-Authenticate": cronSecretScheme.challenge ?? "Bearer" },
    );
  }
  return { scheme: scheme.name, user: null, isAdmin: false, scope: null };
};

export default cronSecretResolver;
