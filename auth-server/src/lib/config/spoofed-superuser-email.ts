import "server-only";
import { getServerSetting } from "@/lib/auth-db/server-settings";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type Redis from "ioredis";

export default async function spoofedSuperuserEmail(db: Kysely<AuthDatabase>, redis?: Redis): Promise<string> {
  const setting_key = "spoofed_superuser_email" as const;
  try {
    const setting = await getServerSetting(setting_key, db, redis);
    if (typeof setting !== 'string') {
      throw new TypeError("Expected result to be of type 'string'")
    }
    return setting;
  } catch (e: unknown) {
    console.error(`Error loading server config setting '${setting_key}': `, e);
    throw new Error(`Error loading server config setting: '${setting_key}'`)
  }
}
