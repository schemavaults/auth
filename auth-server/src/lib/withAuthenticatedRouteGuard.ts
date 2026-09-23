import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard as _withAuthenticatedServerComponentRouteGuard,
  type TProtectedAuthenticatedPageServerComponent,
  type IBaseProtectedAuthenticatedServerComponentPageProps,
  type IBaseProtectedAuthenticatedApiRouteInputs,
} from "@schemavaults/auth-server-sdk/route_guards";
import { ServerlessDatabase } from "./auth-db";
import { RedisCache } from "./redis";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";
import isUserInOrganization from "./isUserInOrganization";
import { createRouteGuardTokenRevocationCheck } from "./token-revocation";

export interface IProtectedAuthenticatedServerComponentPageProps extends IBaseProtectedAuthenticatedServerComponentPageProps {
  dbh: ServerlessDatabase;
  redis: RedisCache;
}

export interface IWithAuthenticatedServerComponentRouteGuardWrapperOpts {
  /**
   * Same-origin path of the page being protected (e.g. `/mfa`,
   * `/orgs/acme`). Forwarded to `/auth/login?next_href=...` when an
   * unauthenticated user is bounced to the login page, so the
   * post-login redirect can return them to where they were headed.
   */
  next_href?: string;
}

export async function withAuthenticatedServerComponentRouteGuard(
  server_component: TProtectedAuthenticatedPageServerComponent<IProtectedAuthenticatedServerComponentPageProps>,
  wrapper_opts?: IWithAuthenticatedServerComponentRouteGuardWrapperOpts,
) {
  await using dbh = ServerlessDatabase.createDBH();
  await using redis = RedisCache.createConnection();
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return _withAuthenticatedServerComponentRouteGuard<IProtectedAuthenticatedServerComponentPageProps>(
    server_component,
    {
      dbh,
      redis
    },
    {
      route_guard_type: 'authenticated',
      jwt_keys_manager,
      api_server_id: getAuthServerAppId(),
      error_page_url: '/error',
      next_href: wrapper_opts?.next_href,
      custom_is_user_in_organization: async (user, org_id) => await isUserInOrganization(dbh.db, user, org_id),
      // Reject sessions revoked by logout / password reset even though the
      // token still verifies cryptographically.
      is_token_revoked: createRouteGuardTokenRevocationCheck({ db: dbh.db, redis }),
    })
}

export interface IAuthenticatedApiRouteGuardInputs extends IBaseProtectedAuthenticatedApiRouteInputs {
  dbh: ServerlessDatabase
  redis: RedisCache
}

export type { IAuthenticatedApiRouteGuardInputs as IProtectedAuthenticatedApiRouteProps };

// The API route guard that used to live here (`withAuthenticatedApiRouteGuard`)
// was retired when the API routes moved onto @schemavaults/openapi-operations:
// operations declare `requireAuth({ schemes: sessionSchemes })` and the
// credential resolvers in `src/lib/api/auth-resolvers/` enforce it. The props
// interface above is kept for handlers bridged through
// `src/lib/api/legacy-route-props.ts`.
