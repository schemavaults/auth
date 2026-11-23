import "server-only";
import { z } from "zod";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  schemaVaultsApiServerDomainRefSchema,
  type SchemaVaultsApiServerDomainRef,
  type ApiServerId,
  getHardcodedApiDomains,
  isHardcodedApiServerId,
} from "@schemavaults/app-definitions";
import { API_SERVER_DOMAIN_REF_COLUMNS } from "./api-domains-table";

/**
 * @description The domains registered to an API server (the hardcoded API
 * servers' come from the server's environment).
 */
export async function getApiServerDomains(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  api_server_id: ApiServerId,
  debug: boolean = false,
): Promise<readonly SchemaVaultsApiServerDomainRef[]> {

  if (debug) {
    console.log(`[SchemaVaultsApiServerRegistry] getApiServerDomains('${api_server_id}')`)
  }

  if (isHardcodedApiServerId(api_server_id)) {
    return getHardcodedApiDomains(api_server_id);
  }

  // Only the ref's columns: the verification columns (migration 00057)
  // are not part of the strict ref schema; see
  // listApiServerDomainVerifications() for them.
  const queryApiServers = db
    .selectFrom("api_server_domains")
    .where("api_server_id", "=", api_server_id)
    .limit(50)
    .select(API_SERVER_DOMAIN_REF_COLUMNS);
  const rows = await queryApiServers.execute();
  const parsed_domains = await Promise.all(
    rows.map((row) => {
      const createdAt: number =
        typeof row.created_at === "string"
          ? parseInt(row.created_at)
          : row.created_at;
      if (isNaN(createdAt)) {
        throw new Error(
          "Failed to parse created_at for API server domain from database",
        );
      }
      return schemaVaultsApiServerDomainRefSchema.safeParseAsync({
        ...row,
        created_at: createdAt,
      });
    }),
  );
  return parsed_domains.map((parsed, index) => {
    if (!parsed.success) {
      console.error(
        `Failed to parse API server domain from database (row ${index}):`,
        JSON.stringify(z.treeifyError(parsed.error), null, 2),
        "\nRaw row:",
        JSON.stringify(rows[index], null, 2),
      );
      throw new Error("Failed to parse API server domains from database", {
        cause: parsed.error,
      });
    }
    return parsed.data;
  });
}

export default getApiServerDomains;
