import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export default async function doesSomeAdminUserExist(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  debug: boolean = false
): Promise<boolean> {
  if (debug) {
    console.log("[doesSomeAdminUserExist] Checking if any admin user exists...");
  }

  try {
    const result = await db
      .selectFrom("users")
      .where("admin", "=", true)
      .select("uid")
      .limit(1)
      .executeTakeFirst();

    const adminExists = result !== undefined;

    if (debug) {
      console.log(`[doesSomeAdminUserExist] Admin user exists: ${adminExists}`);
    }

    return adminExists;
  } catch (e: unknown) {
    console.error("[doesSomeAdminUserExist] Failed to check for admin user:", e);
    throw new Error("Failed to check if an admin user exists");
  }
}
