import "server-only";
import { getServerSetting } from "@/lib/auth-db/server-settings";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type Redis from "ioredis";

/**
 * @description Whether non-admin users may create client applications and
 * API servers owned directly by their own account (rather than through an
 * organization they administer). Backed by the
 * `allow_user_owned_resource_creation` server setting (default: enabled).
 */
export default async function allowUserOwnedResourceCreation(
  db: Kysely<AuthDatabase>,
  redis?: Redis,
): Promise<boolean> {
  const setting_key = "allow_user_owned_resource_creation" as const;
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
