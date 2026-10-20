// app-service-accounts.ts
//
// A client application's SERVICE ACCOUNT: the machine identity that the
// OAuth2 client_credentials grant (RFC 6749 §4.4) mints access tokens
// for. It is a USERS row (migration 00038 `service_account_app_id`) so
// every existing token, audience, revocation and audit path treats an
// M2M token exactly like a user token — the only differences are that a
// service account has no password (it can never sign in interactively),
// its email is a synthetic `<app_id>@<domain>` address under the
// `service_account_email_domain` server setting (default: the reserved,
// undeliverable `service-accounts.invalid`; humans can never register
// under either — see lib/config/service-account-email-domain.ts), and
// its tokens carry the `service_account: true` claim.
//
// At most one service account exists per app. It is created lazily by
// the first successful client_credentials grant (or explicitly via the
// management API) and lives with the app: deleting the app cascades to
// the service account, and deleting the service account revokes nothing
// retroactively beyond what deleting any user does (stateless access
// tokens stay verifiable until they expire).
//
// Dynamically registered clients (RFC 7591, owner type
// `dynamic-client-registration`) never get one: anyone can register such
// a client anonymously, and a service account would give that
// registration an unattended machine identity. The token endpoint
// refuses them the grant; creation refuses them here as well.

import "server-only";
import {
  appIdSchema,
  DYNAMIC_CLIENT_REGISTRATION_OWNER_TYPE,
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
import {
  DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN,
  getServiceAccountEmailDomain,
} from "@/lib/config/service-account-email-domain";
import ServiceAccountUnavailableError from "@/lib/error/ServiceAccountUnavailableError";

export { DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN };

/**
 * The synthetic email of an app's service account under the given
 * domain. App ids are `[a-z0-9_-]` (see `appIdSchema`), which is a valid
 * email local part.
 */
export function serviceAccountEmailForApp(
  app_id: AppId,
  domain: string = DEFAULT_SERVICE_ACCOUNT_EMAIL_DOMAIN,
): string {
  return `${app_id}@${domain}`;
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

/**
 * Refuses apps that may not be handed a service account: unknown apps and
 * dynamically registered (ownerless) clients, whose registration is
 * anonymous. Only creation (and handing out an existing one) is refused:
 * reading and deleting stay available so an administrator can remove a
 * service account created for such a client before this rule existed.
 *
 * @throws ServiceAccountUnavailableError for a dynamically registered client.
 */
async function assertAppMayHaveServiceAccount(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
): Promise<void> {
  await assertManageableAppId(app_id);
  const app = await db
    .selectFrom("apps")
    .select("owner_type")
    .where("app_id", "=", app_id)
    .executeTakeFirst();
  if (!app) {
    throw new Error(`Cannot create a service account for unknown app '${app_id}'`);
  }
  if (app.owner_type === DYNAMIC_CLIENT_REGISTRATION_OWNER_TYPE) {
    throw new ServiceAccountUnavailableError(app_id);
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
 *
 * @throws ServiceAccountUnavailableError for a dynamically registered
 * client, even one that already has a service account.
 */
export async function getOrCreateAppServiceAccount(
  db: Kysely<AuthDatabase>,
  app_id: AppId,
  debug: boolean = false,
): Promise<GetOrCreateAppServiceAccountResult> {
  await assertAppMayHaveServiceAccount(db, app_id);

  const existing = await getAppServiceAccount(db, app_id);
  if (existing) {
    return { user: existing, created: false };
  }

  const uid: string = crypto.randomUUID();
  const created_at: number = Date.now();
  const email_domain: string = await getServiceAccountEmailDomain(db);
  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("users")
        .values({
          uid,
          email: serviceAccountEmailForApp(app_id, email_domain),
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
      // A new service account starts outside the app's organization. The
      // membership endpoint refuses apps without a service account and
      // deleteUser() clears the role with it, so a row here can only be
      // stale (stored before those rules, or by a call racing a removal).
      await trx
        .deleteFrom("app_service_account_organization_roles")
        .where("app_id", "=", app_id)
        .execute();
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
