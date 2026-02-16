import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard as _withAuthenticatedServerComponentRouteGuard,
  withAuthenticatedApiRouteGuard as _withAuthenticatedApiRouteGuard,
  type TProtectedAuthenticatedPageServerComponent,
  type TProtectedAuthenticatedApiRoute,
  type IBaseProtectedAuthenticatedServerComponentPageProps,
  type IBaseProtectedAdminApiRouteInputs,
} from "@schemavaults/auth-server-sdk/route_guards";
import { ServerlessDatabase } from "./auth-db";
import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";
import type { ApiServerId } from "@schemavaults/app-definitions";
import AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";

import { type NextRequest, NextResponse } from "next/server";

export async function withAuthenticatedServerComponentRouteGuard(
  server_component: TProtectedAuthenticatedPageServerComponent<{ dbh: ServerlessDatabase }>
) {
  await using dbh = ServerlessDatabase.createDBH();
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return _withAuthenticatedServerComponentRouteGuard(
    server_component,
    {
      dbh
    },
    'authenticated',
    undefined,
    jwt_keys_manager,
    (): ApiServerId => SCHEMAVAULTS_AUTH_APP_ID)
}

export async function withAuthenticatedApiRouteGuard(
  api_route_handler: TProtectedAuthenticatedApiRoute<{ dbh: ServerlessDatabase }>
): Promise<(req: NextRequest) => Promise<NextResponse>> {
  await using dbh = ServerlessDatabase.createDBH();
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return _withAuthenticatedApiRouteGuard(
    api_route_handler,
    { dbh },
    'authenticated',
    undefined,
    jwt_keys_manager,
    (): ApiServerId => SCHEMAVAULTS_AUTH_APP_ID
  );
}

export interface IProtectedAuthenticatedServerComponentPageProps extends IBaseProtectedAuthenticatedServerComponentPageProps {
  dbh: ServerlessDatabase;
}

export interface IProtectedAuthenticatedApiRouteProps extends IBaseProtectedAdminApiRouteInputs {
  dbh: ServerlessDatabase;
}

export type { IProtectedAuthenticatedApiRouteProps as IProtectedAuthenticatedApiRouteInputs }
