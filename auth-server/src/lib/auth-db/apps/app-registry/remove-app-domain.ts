import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  appIdSchema,
  isHardcodedAppId,
  type AppId,
} from "@schemavaults/app-definitions";

/**
 * @description Detaches a domain from an app. Its origin stops being
 * accepted for CORS and, in environments without explicit callback URLs,
 * as a `redirect_uri` origin. Hardcoded apps take their domains from the
 * server's environment and cannot be changed.
 * @returns Whether a row was deleted (false: no such domain on this app)
 */
export async function removeAppDomain(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
  app_domain_ref_id: string,
): Promise<boolean> {
  const parsed_app_id = await appIdSchema.safeParseAsync(app_id);
  if (!parsed_app_id.success) {
    throw new TypeError("Invalid app ID to remove a domain from!", {
      cause: parsed_app_id.error,
    });
  }
  if (isHardcodedAppId(app_id)) {
    throw new Error("Cannot remove a domain from a hardcoded app");
  }

  const result = await db
    .deleteFrom("app_domains")
    .where("app_id", "=", app_id)
    .where("app_domain_ref_id", "=", app_domain_ref_id)
    .executeTakeFirst();

  return result.numDeletedRows > BigInt(0);
}

export default removeAppDomain;
