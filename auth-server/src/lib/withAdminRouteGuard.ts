import "server-only";
import type { ReactElement } from "react";
import type { NextRequest, NextResponse } from "next/server";
import {
  withAdminServerComponentRouteGuard as _withAdminServerComponentRouteGuard,
  withAdminApiRouteGuard as _withAdminApiRouteGuard,
  type TProtectedAdminPageServerComponent,
  type TProtectedAdminApiRoute,
  type IBaseProtectedAdminServerComponentPageProps,
  type IBaseProtectedAdminApiRouteInputs,
} from "@schemavaults/auth-server-sdk/route_guards";
import ServerlessDatabase from "./auth-db/serverless-database";
import { RedisCache } from "./redis";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";
import isUserInOrganization from "./isUserInOrganization";

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
      custom_is_user_in_organization: async (user, org_id) => await isUserInOrganization(dbh.db, user, org_id)
    }
  )
}

export interface IProtectedAdminApiRouteProps extends IBaseProtectedAdminApiRouteInputs {
  dbh: ServerlessDatabase;
  redis: RedisCache;
}

export async function withAdminApiRouteGuard(
  api_server_handler: TProtectedAdminApiRoute<IProtectedAdminApiRouteProps>
): Promise<(req: NextRequest) => Promise<NextResponse>> {
  // The guarded route below is a lazy handler that Next.js invokes *after*
  // this factory returns. The dbh/redis resources must therefore be created
  // and disposed inside that handler — if we `await using` them out here they
  // get disposed the moment this factory returns (before the request runs),
  // which closes the Redis connection and surfaces as
  // "Connection is closed" when a handler touches `redis.client`.
  return async (req: NextRequest): Promise<NextResponse> => {
    await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH()
    await using redis: RedisCache = RedisCache.createConnection()
    const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
    const guarded = _withAdminApiRouteGuard<IProtectedAdminApiRouteProps>(
      api_server_handler,
      { dbh, redis },
      {
        custom_is_authorized_check: async (props) => props.user.admin === true,
        api_server_id: getAuthServerAppId(),
        jwt_keys_manager,
        custom_is_user_in_organization: async (user, org_id) => await isUserInOrganization(dbh.db, user, org_id)
      }
    );
    return await guarded(req);
  };
}

export type { IProtectedAdminApiRouteProps as IProtectedAdminApiRouteInputs }
