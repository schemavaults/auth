import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { countTokensIssuedSinceGroupedByColumn } from "@/lib/auth-db/issued-tokens";
import { resolveAppNames } from "./resolve-app-names";

export interface TopMostPopularAppRow {
  client_app_id: string;
  app_name: string;
  access_token_count: number;
  refresh_token_count: number;
}

/**
 * List the client applications that issued the most tokens since `since_ms`,
 * ranked by total tokens (access + refresh). Both token types carry the real
 * `client_app_id`, so both contribute to an app's popularity.
 */
export async function listTopMostPopularAppsSince(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  since_ms: number,
  limit: number = 10,
): Promise<readonly TopMostPopularAppRow[]> {
  const countsByAppId = await countTokensIssuedSinceGroupedByColumn(
    db,
    since_ms,
    "client_app_id",
  );

  const ranked = Array.from(countsByAppId.entries())
    .map(([client_app_id, c]) => ({
      client_app_id,
      access: c.access,
      refresh: c.refresh,
      total: c.access + c.refresh,
    }))
    .sort((x, y) => {
      if (y.total !== x.total) return y.total - x.total;
      if (y.access !== x.access) return y.access - x.access;
      return x.client_app_id < y.client_app_id
        ? -1
        : x.client_app_id > y.client_app_id
          ? 1
          : 0;
    })
    .slice(0, limit);

  if (ranked.length === 0) return [];

  // Resolve human-readable names for the top apps only.
  const nameById = await resolveAppNames(
    db,
    ranked.map((r) => r.client_app_id),
  );

  return ranked.map((r) => ({
    client_app_id: r.client_app_id,
    app_name: nameById.get(r.client_app_id) ?? r.client_app_id,
    access_token_count: r.access,
    refresh_token_count: r.refresh,
  }));
}

export default listTopMostPopularAppsSince;
