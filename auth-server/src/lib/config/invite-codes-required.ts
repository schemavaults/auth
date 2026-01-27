import "server-only";
import { getServerSetting } from "@/lib/auth-db/server-settings";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export default async function inviteCodesRequired(db: Kysely<AuthDatabase>): Promise<boolean> {
  const setting_key = "invite_code_required" as const;
  try {
    const setting = await getServerSetting(setting_key, db);
    if (typeof setting !== 'boolean') {
      throw new TypeError("Expected result to be of type 'boolean'")
    }
    return setting;
  } catch (e: unknown) {
    console.error(`Error loading server config setting '${setting_key}': `, e);
    throw new Error(`Error loading server config setting: '${setting_key}'`)
  }
}
