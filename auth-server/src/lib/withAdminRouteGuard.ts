import "server-only";
import {
  withAdminServerComponentRouteGuard as _withAdminServerComponentRouteGuard,
  withAdminApiRouteGuard as _withAdminApiRouteGuard,
  type TProtectedAdminPageServerComponent,
  type TProtectedAdminApiRoute,
  IBaseProtectedAdminServerComponentPageProps,
  IBaseProtectedAdminApiRouteInputs,
} from "@schemavaults/auth-server-sdk/route_guards";
import ServerlessDatabase from "./auth-db/serverless-database";
import SCHEMAVAULTS_AUTH_APP_ID from "./SCHEMAVAULTS_AUTH_APP_ID";
import type { ApiServerId } from "@schemavaults/app-definitions";
import AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";

import type { ReactElement } from "react";
import type { NextRequest, NextResponse } from "next/server";

export async function withAdminServerComponentRouteGuard(server_component: TProtectedAdminPageServerComponent<{
  dbh: ServerlessDatabase
}>): Promise<ReactElement> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH()
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return await _withAdminServerComponentRouteGuard(
    server_component,
    { dbh },
    async (props) => props.user.admin === true,
    jwt_keys_manager,
    (): ApiServerId => SCHEMAVAULTS_AUTH_APP_ID
  )
}

export async function withAdminApiRouteGuard(api_server_handler: TProtectedAdminApiRoute<{
  dbh: ServerlessDatabase
}>): Promise<(req: NextRequest) => Promise<NextResponse>> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH()
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return _withAdminApiRouteGuard(
    api_server_handler,
    { dbh },
    async (props) => props.user.admin === true,
    jwt_keys_manager,
    (): ApiServerId => SCHEMAVAULTS_AUTH_APP_ID
  );
}

export interface IProtectedAdminServerComponentPageProps extends IBaseProtectedAdminServerComponentPageProps {
  dbh: ServerlessDatabase;
}

export interface IProtectedAdminApiRouteProps extends IBaseProtectedAdminApiRouteInputs {
  dbh: ServerlessDatabase;
}

export type { IProtectedAdminApiRouteProps as IProtectedAdminApiRouteInputs }
