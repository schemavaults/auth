import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { type ApiServerId, apiServerIdSchema, isHardcodedApiServerId } from "@schemavaults/app-definitions";

export async function deleteApiServer(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  api_server_id: ApiServerId,
): Promise<{ success: boolean; message: string }> {
  const parsed = await apiServerIdSchema.safeParseAsync(api_server_id);
  if (!parsed.success) {
    return { success: false, message: "Invalid API server ID provided!" };
  }

  if (isHardcodedApiServerId(api_server_id)) {
    return { success: false, message: "Cannot delete a hardcoded API server!" };
  }

  try {
    const result = await db
      .deleteFrom("api_servers")
      .where("api_server_id", "=", api_server_id)
      .executeTakeFirst();

    if (result.numDeletedRows === BigInt(0)) {
      return { success: false, message: "API server not found" };
    }

    return { success: true, message: "API server deleted successfully" };
  } catch (e: unknown) {
    console.error("Failed to delete API server:", e);
    return { success: false, message: "Failed to delete API server" };
  }
}

export default deleteApiServer;
