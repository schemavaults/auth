import "server-only";
import type { ReactElement } from "react";
import {
  withAdminServerComponentRouteGuard as _withAdminServerComponentRouteGuard,
  type TProtectedAdminPageServerComponent,
  type IBaseProtectedAdminServerComponentPageProps,
  type IBaseProtectedAdminApiRouteInputs,
} from "@schemavaults/auth-server-sdk/route_guards";
import ServerlessDatabase from "./auth-db/serverless-database";
import { RedisCache } from "./redis";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";
import isUserInOrganization from "./isUserInOrganization";
import { createRouteGuardTokenRevocationCheck } from "./token-revocation";

export interface IProtectedAdminServerComponentPageProps extends IBaseProtectedAdminServerComponentPageProps {
  dbh: ServerlessDatabase;
  redis: RedisCache;
}

export interface IWithAdminServerComponentRouteGuardWrapperOpts {
  /**
   * Same-origin path of the admin page being protected (e.g.
   * `/admin/users`). Forwarded to `/auth/login?next_href=...` when an
   * unauthenticated user is bounced to the login page, so the
   * post-login redirect can return them to where they were headed.
   */
  next_href?: string;
}

export async function withAdminServerComponentRouteGuard(
  server_component: TProtectedAdminPageServerComponent<IProtectedAdminServerComponentPageProps>,
  wrapper_opts?: IWithAdminServerComponentRouteGuardWrapperOpts,
): Promise<ReactElement> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH()
  await using redis: RedisCache = RedisCache.createConnection()
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return await _withAdminServerComponentRouteGuard<IProtectedAdminServerComponentPageProps>(
    server_component,
    { dbh, redis },
    {
      route_guard_type: "admin",
      custom_is_authorized_check: async (props): Promise<boolean> => props.user.admin === true,
      jwt_keys_manager,
      api_server_id: getAuthServerAppId(),
      next_href: wrapper_opts?.next_href,
      custom_is_user_in_organization: async (user, org_id) => await isUserInOrganization(dbh.db, user, org_id),
      is_token_revoked: createRouteGuardTokenRevocationCheck({ db: dbh.db, redis }),
    }
  )
}

export interface IProtectedAdminApiRouteProps extends IBaseProtectedAdminApiRouteInputs {
  dbh: ServerlessDatabase;
  redis: RedisCache;
}

// The admin API route guard that used to live here (`withAdminApiRouteGuard`)
// was retired when the API routes moved onto @schemavaults/openapi-operations:
// operations declare `requireAuth({ schemes: sessionSchemes, routeGuard: "admin" })`.
// The props interface above is kept for handlers bridged through
// `src/lib/api/legacy-route-props.ts`.

export type { IProtectedAdminApiRouteProps as IProtectedAdminApiRouteInputs }
