import "server-only";
import {
  appIdSchema,
  isHardcodedAppId,
  type AppId,
} from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { AppClientSecret } from "./app-client-secrets-table";

function parseTimestampColumn(value: unknown, column: string): number {
  const parsed: number =
    typeof value === "string" ? parseInt(value) : Number(value);
  if (isNaN(parsed)) {
    throw new Error(`Failed to parse ${column} from app_client_secrets row`);
  }
  return parsed;
}

/**
 * Load the stored client-secret record for an app, or null when the app
 * is a public client (no secret registered). Hardcoded apps never have
 * secrets — they authenticate nothing at the token endpoints beyond
 * PKCE.
 */
export async function getAppClientSecretRecord(
  db: Kysely<AuthDatabase>,
  app_id: AppId,
): Promise<AppClientSecret | null> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new Error("Invalid app ID to load a client secret for!");
  }

  if (isHardcodedAppId(app_id)) {
    return null;
  }

  const row = await db
    .selectFrom("app_client_secrets")
    .where("app_id", "=", app_id)
    .selectAll()
    .executeTakeFirst();
  if (!row) {
    return null;
  }

  return {
    ...row,
    created_at: parseTimestampColumn(row.created_at, "created_at"),
    updated_at: parseTimestampColumn(row.updated_at, "updated_at"),
  };
}

/**
 * Store (or rotate) the hashed client secret for an app. Upserts: on
 * rotation `created_at` keeps the original generation time and
 * `updated_at` records the rotation.
 */
export async function setAppClientSecret(
  db: Kysely<AuthDatabase>,
  app_id: AppId,
  secret_hash: string,
  created_by: string | null,
): Promise<void> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new Error("Invalid app ID to store a client secret for!");
  }
  if (isHardcodedAppId(app_id)) {
    throw new Error("Cannot store a client secret for hardcoded apps");
  }
  if (typeof secret_hash !== "string" || secret_hash.length === 0) {
    throw new Error("Missing hashed client secret to store!");
  }

  const now: number = Date.now();
  await db
    .insertInto("app_client_secrets")
    .values({
      app_id,
      secret_hash,
      created_at: now,
      updated_at: now,
      created_by,
    })
    .onConflict((oc) =>
      oc.column("app_id").doUpdateSet({
        secret_hash,
        updated_at: now,
        created_by,
      }),
    )
    .execute();
}

/**
 * Remove an app's client secret, reverting it to a public client.
 * Returns whether a secret actually existed.
 */
export async function deleteAppClientSecret(
  db: Kysely<AuthDatabase>,
  app_id: AppId,
): Promise<boolean> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new Error("Invalid app ID to delete a client secret for!");
  }

  const result = await db
    .deleteFrom("app_client_secrets")
    .where("app_id", "=", app_id)
    .executeTakeFirst();
  return result.numDeletedRows > BigInt(0);
}
