import "server-only";
import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { partitionGrantedScopes } from "@schemavaults/auth-common";
import type Redis from "ioredis";
import type { ServerlessDatabase } from "@/lib/auth-db";
import {
  recordApiScopeConsents,
  recordImplicitConsentForGrant,
} from "@/lib/auth-db/api-scope-consents";
import { authorizeAppForUser } from "@/lib/auth-db/apps/authorized-apps-registry";
import {
  decideDeviceAuthorization,
  type DeviceAuthorization,
} from "@/lib/auth-db/device-authorizations";
import { UserRegistry } from "@/lib/auth-db";
import { isEmailVerificationRequiredForClientApp } from "@/lib/email-verification/third-party-app-gate";
import { resolveAuthorizationCodeGrant } from "@/lib/oauth2/api-scopes";

export type ApproveDeviceAuthorizationResult =
  | {
      kind: "approved";
      /** The granted scope; null for a plain OAuth 2.1 grant. */
      scope: string | null;
      /** The API scopes among it. */
      api_scopes: string[];
    }
  /** The account's address must be verified before a third-party hand-off. */
  | { kind: "email_verification_required" }
  /** Decided, redeemed or expired meanwhile: nothing was approved. */
  | { kind: "no_longer_pending" };

export interface ApproveDeviceAuthorizationOptions {
  dbh: ServerlessDatabase;
  redis?: Redis;
  uid: string;
  authorization: DeviceAuthorization;
  /** The API scopes the user left ticked; the rest of those asked for are not granted. */
  approved_api_scopes: readonly string[];
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

/**
 * The user approved a device authorization on the `/device` page. What a
 * PKCE sign-in does across the consent screen and the code mint, for a
 * device instead of a redirect:
 *
 * 1. The "verify your email before a third-party hand-off" gate, as on every
 *    surface that mints an authorization code.
 * 2. The app is authorized for the user, with the API scopes they approved
 *    (among those the request asks for and the app may be granted).
 * 3. The grant is resolved as for an authorization code (OIDC scopes plus
 *    consented API scopes; a first-party connection's consent is implicit
 *    and recorded) and bound to the request, which becomes `approved`; the
 *    device's next poll redeems it.
 */
export async function approveDeviceAuthorization({
  dbh,
  redis,
  uid,
  authorization,
  approved_api_scopes,
  environment,
  debug = false,
}: ApproveDeviceAuthorizationOptions): Promise<ApproveDeviceAuthorizationResult> {
  const client_app_id = authorization.client_app_id;

  const user = await new UserRegistry(dbh.db, debug).getUserByUID(uid);
  if (!user) {
    throw new Error(`User '${uid}' of the session no longer exists`);
  }
  if (
    await isEmailVerificationRequiredForClientApp({
      db: dbh.db,
      redis,
      client_app_id,
      email_verified: user.email_verified === true,
    })
  ) {
    return { kind: "email_verification_required" };
  }

  const resolve = () =>
    resolveAuthorizationCodeGrant({
      dbh,
      client_app_id,
      uid,
      nonce: null,
      scope: authorization.requested_scope,
      resource: authorization.resource,
      environment,
      debug,
    });

  const requested = await resolve();
  const consentable: string[] = approved_api_scopes.filter((scope) =>
    requested.requested_api_scopes.includes(scope),
  );
  await dbh.db.transaction().execute(async (trx) => {
    await authorizeAppForUser(trx, uid, client_app_id);
    if (requested.api_server_id && consentable.length > 0) {
      await recordApiScopeConsents(trx, {
        uid,
        client_app_id,
        api_server_id: requested.api_server_id,
        scopes: consentable,
      });
    }
  });

  // Re-resolved now that the consent is recorded: the grant holds the API
  // scopes the user consented to, now or before.
  const { grant } = consentable.length > 0 ? await resolve() : requested;
  await recordImplicitConsentForGrant(dbh.db, { uid, client_app_id, grant });

  const decided: boolean = await decideDeviceAuthorization(dbh.db, {
    device_authorization_id: authorization.device_authorization_id,
    uid,
    decision: {
      decision: "approved",
      scope: grant.scope,
      scope_api_server_id: grant.scope_api_server_id,
    },
  });
  if (!decided) {
    return { kind: "no_longer_pending" };
  }
  return {
    kind: "approved",
    scope: grant.scope,
    api_scopes: partitionGrantedScopes(grant.scope).api,
  };
}

export default approveDeviceAuthorization;
