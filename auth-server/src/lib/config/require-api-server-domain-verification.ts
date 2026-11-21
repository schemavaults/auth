import "server-only";
import { getServerSetting } from "@/lib/auth-db/server-settings";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type Redis from "ioredis";

/**
 * @description Whether RFC 8707 resource URLs resolve to API servers only
 * through verified domains, or may still fall back to unverified domain
 * registrations when no verified domain matches. Backed by the
 * `require_api_server_domain_verification` server setting (default: off,
 * for the transition to domain verification).
 */
export default async function requireApiServerDomainVerification(
  db: Kysely<AuthDatabase>,
  redis?: Redis,
): Promise<boolean> {
  const setting_key = "require_api_server_domain_verification" as const;
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
