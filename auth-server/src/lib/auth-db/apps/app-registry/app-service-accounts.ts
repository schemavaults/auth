// app-service-accounts.ts
//
// A client application's SERVICE ACCOUNT: the machine identity that the
// OAuth2 client_credentials grant (RFC 6749 §4.4) mints access tokens
// for. It is a USERS row (migration 00038 `service_account_app_id`) so
// every existing token, audience, revocation and audit path treats an
// M2M token exactly like a user token — the only differences are that a
// service account has no password (it can never sign in interactively),
// its email is a synthetic, undeliverable address, and its tokens carry
// the `service_account: true` claim.
//
// At most one service account exists per app. It is created lazily by
// the first successful client_credentials grant (or explicitly via the
// management API) and lives with the app: deleting the app cascades to
// the service account, and deleting the service account revokes nothing
// retroactively beyond what deleting any user does (stateless access
// tokens stay verifiable until they expire).

import "server-only";
import {
  appIdSchema,
  isHardcodedAppId,
  type AppId,
} from "@schemavaults/app-definitions";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { isUniqueViolation } from "@/lib/auth-db/is-unique-violation";
import {
  deleteUser,
  parseUserDocument,
  type UserDocument,
} from "@/lib/auth-db/users";
import authorizeAppForUser from "@/lib/auth-db/apps/authorized-apps-registry/authorize-app-for-user";

/**
 * Reserved TLD (RFC 2606) so a service account's email can never be
 * delivered to, registered as, or confused with a real mailbox.
 */
export const SERVICE_ACCOUNT_EMAIL_DOMAIN = "service-accounts.invalid" as const;

/**
 * The synthetic email of an app's service account. App ids are
 * `[a-z0-9_-]` (see `appIdSchema`), which is a valid email local part.
 */
export function serviceAccountEmailForApp(app_id: AppId): string {
  return `${app_id}@${SERVICE_ACCOUNT_EMAIL_DOMAIN}`;
}

async function assertManageableAppId(app_id: AppId): Promise<void> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid app ID for a service account!");
  }
  if (isHardcodedAppId(app_id)) {
    // Hardcoded apps can never hold a client secret, so they can never
    // use the client_credentials grant — and they have no APPS row for
    // the service account's foreign key to reference.
    throw new Error("Hardcoded apps cannot have service accounts");
  }
}

const SERVICE_ACCOUNT_COLUMNS = [
  "email",
  "email_verified",
  "admin",
  "created_at",
  "disabled",
  "invite_code",
  "uid",
  "username",
  "first_name",
  "middle_name",
  "last_name",
  "display_name",
  "service_account_app_id",
] as const;

/**
 * Load the service account of an app, or null when none has been created
 * yet.
 */
export async function getAppServiceAccount(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
): Promise<UserDocument | null> {
  await assertManageableAppId(app_id);
  const row = await db
    .selectFrom("users")
    .select([...SERVICE_ACCOUNT_COLUMNS])
    .where("service_account_app_id", "=", app_id)
    .executeTakeFirst();
  return row ? await parseUserDocument(row) : null;
}

export interface GetOrCreateAppServiceAccountResult {
  user: UserDocument;
  /** Whether this call created the service account. */
  created: boolean;
}

/**
 * Return the app's service account, creating it when the app has none.
 * Creation inserts the USERS row and, in the same transaction, the app's
 * `authorized_apps` record for it — the client IS the resource owner in
 * a client_credentials grant, so the app is authorized for its own
 * service account by construction (which is what the shared audience
 * validation checks). Concurrent first grants race safely: the partial
 * unique index on `service_account_app_id` lets exactly one insert win,
 * and the loser re-reads the winner's row.
 */
export async function getOrCreateAppServiceAccount(
  db: Kysely<AuthDatabase>,
  app_id: AppId,
  debug: boolean = false,
): Promise<GetOrCreateAppServiceAccountResult> {
  await assertManageableAppId(app_id);

  const existing = await getAppServiceAccount(db, app_id);
  if (existing) {
    return { user: existing, created: false };
  }

  const uid: string = crypto.randomUUID();
  const created_at: number = Date.now();
  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("users")
        .values({
          uid,
          email: serviceAccountEmailForApp(app_id),
          // There is no mailbox to verify; the identity is established
          // by the app's client secret instead.
          email_verified: true,
          created_at,
          admin: false,
          disabled: false,
          service_account_app_id: app_id,
        })
        .executeTakeFirstOrThrow();
      await authorizeAppForUser(trx, uid, app_id, debug);
    });
  } catch (e: unknown) {
    if (isUniqueViolation(e)) {
      // Lost the race against a concurrent creation: use the winner.
      const winner = await getAppServiceAccount(db, app_id);
      if (winner) {
        return { user: winner, created: false };
      }
    }
    console.error(
      `[getOrCreateAppServiceAccount] Failed to create the service account for app '${app_id}': `,
      e,
    );
    throw new Error("Failed to create the service account for the app");
  }

  const user = await getAppServiceAccount(db, app_id);
  if (!user) {
    throw new Error("Service account vanished right after creation");
  }
  if (debug) {
    console.log(
      `[getOrCreateAppServiceAccount] Created service account '${uid}' for app '${app_id}'`,
    );
  }
  return { user, created: true };
}

/**
 * Delete the app's service account (via the shared user deletion, which
 * cascades issued-token records and tombstones the uid). Returns whether
 * a service account existed.
 */
export async function deleteAppServiceAccount(
  db: Kysely<AuthDatabase>,
  app_id: AppId,
  debug: boolean = false,
): Promise<boolean> {
  const existing = await getAppServiceAccount(db, app_id);
  if (!existing) {
    return false;
  }
  await deleteUser(db, existing.uid, debug);
  return true;
}
