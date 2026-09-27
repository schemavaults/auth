import "server-only";
import { getServerSetting } from "@/lib/auth-db/server-settings";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type Redis from "ioredis";

/**
 * @description Whether an account must have a verified e-mail address before
 * the auth server hands it off to a third-party client application (mints an
 * authorization code for an app other than the auth server itself). Backed by
 * the `require_email_verification_for_third_party_apps` server setting
 * (default: enabled).
 */
export default async function requireEmailVerificationForThirdPartyApps(
  db: Kysely<AuthDatabase>,
  redis?: Redis,
): Promise<boolean> {
  const setting_key = "require_email_verification_for_third_party_apps" as const;
  try {
    const setting = await getServerSetting(setting_key, db, redis);
    if (typeof setting !== "boolean") {
      throw new TypeError("Expected result to be of type 'boolean'");
    }
    return setting;
  } catch (e: unknown) {
    console.error(`Error loading server config setting '${setting_key}': `, e);
    throw new Error(`Error loading server config setting: '${setting_key}'`);
  }
}
