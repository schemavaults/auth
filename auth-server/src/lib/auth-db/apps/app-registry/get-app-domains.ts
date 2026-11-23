import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  type SchemaVaultsAppDomainRef,
  schemaVaultsAppDomainRefSchema,
  appIdSchema,
  isHardcodedAppId,
  getHardcodedAppDomains,
  type AppId,
} from "@schemavaults/app-definitions";

async function parseAppDomainFromDb(
  row: object,
): Promise<SchemaVaultsAppDomainRef> {
  if (!Object.hasOwn(row, "created_at") || !("created_at" in row)) {
    throw new Error("Missing app domain creation time");
  }

  const created_at: number =
    typeof row.created_at === "string"
      ? parseInt(row.created_at)
      : Number(row.created_at);
  if (isNaN(created_at)) {
    throw new Error("Failed to parse app creation time from database");
  }

  const parsed_app_domain =
    await schemaVaultsAppDomainRefSchema.safeParseAsync({
      ...row,
      created_at,
    } as const);
  if (!parsed_app_domain.success) {
    console.error(parsed_app_domain.error);
    throw new Error("Failed to parse app domain from database!");
  }
  return parsed_app_domain.data satisfies SchemaVaultsAppDomainRef;
}

/**
 * @description The domains registered to an app (the hardcoded apps' come
 * from the server's environment).
 */
export async function getAppDomains(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
): Promise<readonly SchemaVaultsAppDomainRef[]> {
  const isValidAppId: boolean = (await appIdSchema.safeParseAsync(app_id))
    .success;
  if (!isValidAppId) {
    throw new Error("Invalid app ID to list domains for!");
  }

  if (isHardcodedAppId(app_id)) {
    return getHardcodedAppDomains(app_id);
  }

  const query = db
    .selectFrom("app_domains")
    .where("app_id", "=", app_id)
    .limit(50)
    .selectAll();
  const rows = await query.execute();

  const parse_domains_promises: Promise<SchemaVaultsAppDomainRef>[] =
    rows.map(parseAppDomainFromDb);

  const parsed_domains: SchemaVaultsAppDomainRef[] = await Promise.all(
    parse_domains_promises,
  );

  return parsed_domains;
}

export default getAppDomains;
