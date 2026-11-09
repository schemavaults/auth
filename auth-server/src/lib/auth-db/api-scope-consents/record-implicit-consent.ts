import "server-only";
import type { AppId } from "@schemavaults/app-definitions";
import { partitionGrantedScopes } from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { isFirstPartyAppApiConnection } from "@/lib/auth-db/apis/first-party-connections";
import authorizeAppForUser from "@/lib/auth-db/apps/authorized-apps-registry/authorize-app-for-user";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import { recordApiScopeConsents } from "./api-scope-consents";

export interface RecordImplicitConsentForGrantOptions {
  uid: string;
  client_app_id: AppId;
  /** The grant an authorization code is about to be minted with. */
  grant: {
    scope: string | null;
    scope_api_server_id: string | null;
  };
}

/**
 * Records the consent a FIRST-PARTY app-to-API connection implies: when a
 * grant carries API scopes of an API server the app's connection to is
 * first-party (`APP_API_SCOPE_POLICIES.first_party`), the user authorizes
 * the app (AUTHORIZED_APPS) and consents to those scopes
 * (USER_APP_SCOPE_CONSENTS) without the consent screen.
 *
 * `generateAuthorizationCode()` calls it for every code it mints, so every
 * mint surface (login, registration, MFA, the session code endpoint, the
 * already-signed-in page, `prompt=none`) leaves the records the token
 * endpoint, introspection and the third-party access page rely on. Only
 * `resolveAuthorizationCodeGrant()` puts unconsented API scopes on such a
 * grant, and only through a first-party connection, so for any other grant
 * this records nothing. Idempotent (existing records keep their times).
 * The connection is re-read here: a connection that stopped being
 * first-party since the grant was resolved records nothing, and the token
 * endpoint then holds the code to the user's explicit consent.
 *
 * Returns whether consent was recorded.
 */
export async function recordImplicitConsentForGrant(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  { uid, client_app_id, grant }: RecordImplicitConsentForGrantOptions,
): Promise<boolean> {
  const api_server_id = grant.scope_api_server_id;
  if (!api_server_id || client_app_id === getAuthServerAppId()) {
    return false;
  }
  const api_scopes: string[] = partitionGrantedScopes(grant.scope).api;
  if (api_scopes.length === 0) {
    return false;
  }
  if (!(await isFirstPartyAppApiConnection(db, client_app_id, api_server_id))) {
    return false;
  }

  const record = async (trx: Kysely<AuthDatabase> | Transaction<AuthDatabase>): Promise<void> => {
    // The app authorization first: scope consents reference it.
    await authorizeAppForUser(trx, uid, client_app_id);
    await recordApiScopeConsents(trx, { uid, client_app_id, api_server_id, scopes: api_scopes });
  };
  // Kysely refuses nested transactions; join the caller's when there is one.
  if (db.isTransaction) {
    await record(db);
  } else {
    await db.transaction().execute(record);
  }
  return true;
}

export default recordImplicitConsentForGrant;
