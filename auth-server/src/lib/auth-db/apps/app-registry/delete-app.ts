import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { appIdSchema, isHardcodedAppId } from "@schemavaults/app-definitions";

export async function deleteApp(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: string,
): Promise<{ success: boolean; message: string }> {
  const parsed = await appIdSchema.safeParseAsync(app_id);
  if (!parsed.success) {
    return { success: false, message: "Invalid app ID provided!" };
  }

  if (isHardcodedAppId(app_id)) {
    return { success: false, message: "Cannot delete a hardcoded app!" };
  }

  try {
    const result = await db
      .deleteFrom("apps")
      .where("app_id", "=", app_id)
      .executeTakeFirst();

    if (result.numDeletedRows === BigInt(0)) {
      return { success: false, message: "App not found" };
    }

    return { success: true, message: "App deleted successfully" };
  } catch (e: unknown) {
    console.error("Failed to delete app:", e);
    return { success: false, message: "Failed to delete app" };
  }
}

export default deleteApp;
