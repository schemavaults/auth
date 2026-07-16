import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard as _withAuthenticatedServerComponentRouteGuard,
  withAuthenticatedApiRouteGuard as _withAuthenticatedApiRouteGuard,
  type TProtectedAuthenticatedPageServerComponent,
  type TProtectedAuthenticatedApiRoute,
  type IBaseProtectedAuthenticatedServerComponentPageProps,
  type IBaseProtectedAuthenticatedApiRouteInputs,
} from "@schemavaults/auth-server-sdk/route_guards";
import { ServerlessDatabase } from "./auth-db";
import { RedisCache } from "./redis";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import type { PotentiallyValidTokenSource } from "@schemavaults/auth-common";
import AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";
import isUserInOrganization from "./isUserInOrganization";
import { type NextRequest, NextResponse } from "next/server";

export interface IProtectedAuthenticatedServerComponentPageProps extends IBaseProtectedAuthenticatedServerComponentPageProps {
  dbh: ServerlessDatabase;
  redis: RedisCache;
}

export async function withAuthenticatedServerComponentRouteGuard(
  server_component: TProtectedAuthenticatedPageServerComponent<IProtectedAuthenticatedServerComponentPageProps>
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
      custom_is_user_in_organization: async (user, org_id) => await isUserInOrganization(dbh.db, user, org_id)
    })
}

export interface IAuthenticatedApiRouteGuardInputs extends IBaseProtectedAuthenticatedApiRouteInputs {
  dbh: ServerlessDatabase
  redis: RedisCache
}

export type { IAuthenticatedApiRouteGuardInputs as IProtectedAuthenticatedApiRouteProps };

export interface IWithAuthenticatedApiRouteGuardWrapperOpts {
  additional_token_sources?: PotentiallyValidTokenSource[];
  /**
   * Scopes the presented token's `scope` claim must include (see
   * `required_scopes` on the SDK guard). Tokens without a scope claim
   * grant no scopes and are denied 403 when this is non-empty.
   */
  required_scopes?: readonly string[];
  debug?: boolean;
}

export async function withAuthenticatedApiRouteGuard(
  api_route_handler: TProtectedAuthenticatedApiRoute<IAuthenticatedApiRouteGuardInputs>,
  wrapper_opts?: IWithAuthenticatedApiRouteGuardWrapperOpts,
): Promise<(req: NextRequest) => Promise<NextResponse>> {
  // The guarded route below is a lazy handler that Next.js invokes *after*
  // this factory returns. The dbh/redis resources must therefore be created
  // and disposed inside that handler — if we `await using` them out here they
  // get disposed the moment this factory returns (before the request runs),
  // which closes the Redis connection and surfaces as
  // "Connection is closed" when a handler touches `redis.client`
  // (e.g. rate-limiting during passkey enrollment).
  return async (req: NextRequest): Promise<NextResponse> => {
    await using dbh = ServerlessDatabase.createDBH();
    await using redis = RedisCache.createConnection();
    const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
    const guarded = _withAuthenticatedApiRouteGuard<IAuthenticatedApiRouteGuardInputs>(
      api_route_handler,
      { dbh, redis },
      {
        route_guard_type: 'authenticated',
        jwt_keys_manager,
        api_server_id: getAuthServerAppId(),
        custom_is_authorized_check: async (opts): Promise<boolean> => !opts.user.disabled,
        custom_is_user_in_organization: async (user, org_id) => await isUserInOrganization(dbh.db, user, org_id),
        additional_token_sources: wrapper_opts?.additional_token_sources,
        required_scopes: wrapper_opts?.required_scopes,
        debug: wrapper_opts?.debug
      }
    );
    return await guarded(req);
  };
}
