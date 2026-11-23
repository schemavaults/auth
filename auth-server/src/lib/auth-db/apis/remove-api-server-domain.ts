import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  type ApiServerId,
  isHardcodedApiServerId,
  isValidApiServerId,
} from "@schemavaults/app-definitions";

/**
 * @description Detaches a domain from an API server: RFC 8707 `resource`
 * URLs on it stop resolving to the API server. Hardcoded API servers take
 * their domains from the server's environment and cannot be changed.
 * @returns Whether a row was deleted (false: no such domain on this API server)
 */
export async function removeApiServerDomain(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  api_server_id: ApiServerId,
  api_server_domain_ref_id: string,
): Promise<boolean> {
  if (!isValidApiServerId(api_server_id)) {
    throw new TypeError("Received invalid API server ID!");
  }
  if (isHardcodedApiServerId(api_server_id)) {
    throw new Error("Cannot remove a domain from a hardcoded API server");
  }

  const result = await db
    .deleteFrom("api_server_domains")
    .where("api_server_id", "=", api_server_id)
    .where("api_server_domain_ref_id", "=", api_server_domain_ref_id)
    .executeTakeFirst();

  return result.numDeletedRows > BigInt(0);
}

export default removeApiServerDomain;
