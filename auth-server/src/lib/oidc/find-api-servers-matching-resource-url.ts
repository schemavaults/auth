import "server-only";
import {
  apiServerIdSchema,
  doesResourceUrlMatchApiServerDomain,
  resourceUrlMatchModeSchema,
  type ApiServerId,
  type ResourceUrlMatchMode,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

/**
 * Largest number of domain rows considered for one resource URL; a
 * deployment with more registered domains under one origin is not a
 * realistic configuration.
 */
const MAX_CANDIDATE_DOMAIN_ROWS = 200;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * @description The API servers with a domain registration matching an RFC
 * 8707 resource URL in the given environment, honouring each API server's
 * `resource_url_match_mode`. Registered domains are origins
 * (`https://api.example.com`), so candidates are pre-filtered by the
 * resource's origin in SQL and then matched exactly (or by path prefix for
 * servers that opted into `prefix` matching) in code.
 *
 * @param registrations `verified`: only registrations whose ownership was
 * verified (migration 00057); `any`: every registration, verified or not.
 */
export async function findApiServersMatchingResourceUrl(
  db: Kysely<AuthDatabase>,
  {
    resource_url,
    origin,
    environment,
    registrations,
  }: {
    resource_url: string;
    origin: string;
    environment: SchemaVaultsAppEnvironment;
    registrations: "verified" | "any";
  },
): Promise<Set<ApiServerId>> {
  let query = db
    .selectFrom("api_server_domains")
    .innerJoin(
      "api_servers",
      "api_servers.api_server_id",
      "api_server_domains.api_server_id",
    )
    .where("api_server_domains.environment", "=", environment)
    .where("api_server_domains.domain", "like", `${escapeLikePattern(origin)}%`);
  if (registrations === "verified") {
    query = query
      .where("api_server_domains.verified_at", "is not", null)
      .where("api_server_domains.verification_method", "is not", null);
  }
  const rows = await query
    .select([
      "api_server_domains.api_server_id as api_server_id",
      "api_server_domains.domain as domain",
      "api_servers.resource_url_match_mode as resource_url_match_mode",
    ])
    .limit(MAX_CANDIDATE_DOMAIN_ROWS)
    .execute();

  const matched = new Set<ApiServerId>();
  for (const row of rows) {
    const mode_parsed = resourceUrlMatchModeSchema.safeParse(row.resource_url_match_mode);
    const mode: ResourceUrlMatchMode = mode_parsed.success ? mode_parsed.data : "exact";
    if (doesResourceUrlMatchApiServerDomain(resource_url, row.domain, mode)) {
      const id = apiServerIdSchema.safeParse(row.api_server_id);
      if (id.success) {
        matched.add(id.data);
      }
    }
  }
  return matched;
}

export default findApiServersMatchingResourceUrl;
