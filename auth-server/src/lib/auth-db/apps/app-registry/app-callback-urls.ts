import "server-only";
import {
  appIdSchema,
  isHardcodedAppId,
  schemaVaultsAppCallbackUrlRefSchema,
  type AppId,
  type SchemaVaultsAppCallbackUrlRef,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { ConflictError } from "@/lib/error/ConflictError";

const MAX_CALLBACK_URLS_PER_APP = 50;

function parseAppCallbackUrlFromDb(row: object): SchemaVaultsAppCallbackUrlRef {
  if (!Object.hasOwn(row, "created_at") || !("created_at" in row)) {
    throw new Error("Missing app callback URL creation time");
  }
  const created_at: number =
    typeof row.created_at === "string"
      ? parseInt(row.created_at)
      : Number(row.created_at);
  if (isNaN(created_at)) {
    throw new Error("Failed to parse app callback URL creation time from database");
  }

  const parsed = schemaVaultsAppCallbackUrlRefSchema.safeParse({
    ...row,
    created_at,
  });
  if (!parsed.success) {
    console.error(parsed.error);
    throw new Error("Failed to parse app callback URL from database!");
  }
  return parsed.data;
}

/**
 * List every explicit callback URL registered for an app (all
 * environments). Hardcoded apps have none — their redirect validation
 * always uses the hardcoded domain allowlist.
 */
export async function listAppCallbackUrls(
  db: Kysely<AuthDatabase>,
  app_id: AppId,
): Promise<readonly SchemaVaultsAppCallbackUrlRef[]> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new Error("Invalid app ID to list callback URLs for!");
  }

  if (isHardcodedAppId(app_id)) {
    return [];
  }

  const rows = await db
    .selectFrom("app_callback_urls")
    .where("app_id", "=", app_id)
    .limit(MAX_CALLBACK_URLS_PER_APP)
    .selectAll()
    .execute();

  return rows.map(parseAppCallbackUrlFromDb);
}

/**
 * List the explicit callback URLs registered for an app in one
 * environment — the allowlist the OAuth2/OIDC redirect_uri validation
 * consults.
 */
export async function listAppCallbackUrlsForEnvironment(
  db: Kysely<AuthDatabase>,
  app_id: AppId,
  environment: SchemaVaultsAppEnvironment,
): Promise<readonly SchemaVaultsAppCallbackUrlRef[]> {
  const all = await listAppCallbackUrls(db, app_id);
  return all.filter((ref) => ref.environment === environment);
}

export async function addAppCallbackUrl(
  db: Kysely<AuthDatabase>,
  app_id: AppId,
  new_callback_url: SchemaVaultsAppCallbackUrlRef,
): Promise<void> {
  const parsed =
    await schemaVaultsAppCallbackUrlRefSchema.safeParseAsync(new_callback_url);
  if (!parsed.success) {
    throw new Error("Received invalid callback URL to associate with app");
  }
  const callback_url_ref = parsed.data;

  if (app_id !== callback_url_ref.app_id) {
    throw new Error("App ID mismatch");
  }

  if (isHardcodedAppId(app_id)) {
    throw new Error("Cannot register callback URLs for hardcoded apps");
  }

  const existing = await listAppCallbackUrls(db, app_id);
  if (existing.length >= MAX_CALLBACK_URLS_PER_APP) {
    throw new ConflictError(
      `An app cannot have more than ${MAX_CALLBACK_URLS_PER_APP} callback URLs`,
    );
  }
  const duplicate = existing.some(
    (ref) =>
      ref.environment === callback_url_ref.environment &&
      ref.callback_url === callback_url_ref.callback_url,
  );
  if (duplicate) {
    throw new ConflictError(
      "This callback URL is already registered for this app and environment",
    );
  }

  try {
    const result = await db
      .insertInto("app_callback_urls")
      .values(callback_url_ref)
      .onConflict((oc) => oc.column("app_callback_url_ref_id").doNothing())
      .executeTakeFirst();

    if (result.numInsertedOrUpdatedRows === BigInt(0)) {
      throw new ConflictError("This app callback URL already exists");
    }
  } catch (e: unknown) {
    if (e instanceof ConflictError) throw e;
    console.error("Failed to add new app callback URL; db insert failed: ", e);
    throw new Error("Failed to add new app callback URL; db insert failed");
  }
}

/**
 * Remove a single callback URL from an app's allowlist. Returns whether
 * a row was actually deleted.
 */
export async function removeAppCallbackUrl(
  db: Kysely<AuthDatabase>,
  app_id: AppId,
  app_callback_url_ref_id: string,
): Promise<boolean> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new Error("Invalid app ID to remove a callback URL from!");
  }

  const result = await db
    .deleteFrom("app_callback_urls")
    .where("app_id", "=", app_id)
    .where("app_callback_url_ref_id", "=", app_callback_url_ref_id)
    .executeTakeFirst();

  return result.numDeletedRows > BigInt(0);
}
