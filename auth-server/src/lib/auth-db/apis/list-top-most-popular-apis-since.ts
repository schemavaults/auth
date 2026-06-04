import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import {
  isHardcodedApiServerId,
  getHardcodedApiServer,
} from "@schemavaults/app-definitions";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { countTokensIssuedSinceGroupedByColumn } from "@/lib/auth-db/issued-tokens";

export interface TopMostPopularApiRow {
  api_server_id: string;
  api_server_name: string;
  access_token_count: number;
  refresh_token_count: number;
}

/**
 * List the API servers (token audiences) that received the most tokens since
 * `since_ms`, ranked by access-token count.
 *
 * Note: refresh tokens are always issued with the auth server itself as their
 * audience, so ranking by access tokens keeps the list reflective of actual
 * resource-API usage rather than refresh-token volume. The refresh count is
 * still surfaced per row for transparency.
 */
export async function listTopMostPopularApisSince(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  since_ms: number,
  limit: number = 10,
): Promise<readonly TopMostPopularApiRow[]> {
  const countsByAudience = await countTokensIssuedSinceGroupedByColumn(
    db,
    since_ms,
    "audience",
  );

  const ranked = Array.from(countsByAudience.entries())
    .map(([api_server_id, c]) => ({
      api_server_id,
      access: c.access,
      refresh: c.refresh,
    }))
    .sort((x, y) => {
      if (y.access !== x.access) return y.access - x.access;
      if (y.refresh !== x.refresh) return y.refresh - x.refresh;
      return x.api_server_id < y.api_server_id
        ? -1
        : x.api_server_id > y.api_server_id
          ? 1
          : 0;
    })
    .slice(0, limit);

  if (ranked.length === 0) return [];

  // Resolve human-readable names for the top API servers only.
  const nameById = new Map<string, string>();
  const dbApiServerIds: string[] = [];
  for (const r of ranked) {
    if (isHardcodedApiServerId(r.api_server_id)) {
      nameById.set(
        r.api_server_id,
        getHardcodedApiServer(r.api_server_id).api_server_name,
      );
    } else {
      dbApiServerIds.push(r.api_server_id);
    }
  }
  if (dbApiServerIds.length > 0) {
    const apiRows = await db
      .selectFrom("api_servers")
      .where("api_server_id", "in", dbApiServerIds)
      .select(["api_server_id", "api_server_name"])
      .execute();
    for (const row of apiRows) {
      nameById.set(row.api_server_id, row.api_server_name);
    }
  }

  return ranked.map((r) => ({
    api_server_id: r.api_server_id,
    api_server_name: nameById.get(r.api_server_id) ?? r.api_server_id,
    access_token_count: r.access,
    refresh_token_count: r.refresh,
  }));
}

export default listTopMostPopularApisSince;
