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
import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";
import AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";

import { type NextRequest, NextResponse } from "next/server";

export interface IProtectedAuthenticatedServerComponentPageProps extends IBaseProtectedAuthenticatedServerComponentPageProps {
  dbh: ServerlessDatabase;
}

export async function withAuthenticatedServerComponentRouteGuard(
  server_component: TProtectedAuthenticatedPageServerComponent<IProtectedAuthenticatedServerComponentPageProps>
) {
  await using dbh = ServerlessDatabase.createDBH();
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return _withAuthenticatedServerComponentRouteGuard<IProtectedAuthenticatedServerComponentPageProps>(
    server_component,
    {
      dbh
    },
    {
      route_guard_type: 'authenticated',
      jwt_keys_manager,
      api_server_id: SCHEMAVAULTS_AUTH_APP_ID,
    })
}

export interface IAuthenticatedApiRouteGuardInputs extends IBaseProtectedAuthenticatedApiRouteInputs {
  dbh: ServerlessDatabase
}

export type { IAuthenticatedApiRouteGuardInputs as IProtectedAuthenticatedApiRouteProps };

export async function withAuthenticatedApiRouteGuard(
  api_route_handler: TProtectedAuthenticatedApiRoute<IAuthenticatedApiRouteGuardInputs>
): Promise<(req: NextRequest) => Promise<NextResponse>> {
  await using dbh = ServerlessDatabase.createDBH();
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return _withAuthenticatedApiRouteGuard<IAuthenticatedApiRouteGuardInputs>(
    api_route_handler,
    { dbh },
    {
      route_guard_type: 'authenticated',
      jwt_keys_manager,
      api_server_id: SCHEMAVAULTS_AUTH_APP_ID,
      custom_is_authorized_check: async (opts): Promise<boolean> => !opts.user.disabled,
    }
  );
}
