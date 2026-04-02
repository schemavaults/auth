import "server-only";
import {
  withAdminServerComponentRouteGuard as _withAdminServerComponentRouteGuard,
  withAdminApiRouteGuard as _withAdminApiRouteGuard,
  type TProtectedAdminPageServerComponent,
  type TProtectedAdminApiRoute,
  type IBaseProtectedAdminServerComponentPageProps,
  type IBaseProtectedAdminApiRouteInputs,
} from "@schemavaults/auth-server-sdk/route_guards";
import ServerlessDatabase from "./auth-db/serverless-database";
import { SCHEMAVAULTS_AUTH_APP_ID } from "@schemavaults/app-definitions";
import type { ApiServerId } from "@schemavaults/app-definitions";
import AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";

import type { ReactElement } from "react";
import type { NextRequest, NextResponse } from "next/server";

export interface IProtectedAdminServerComponentPageProps extends IBaseProtectedAdminServerComponentPageProps {
  dbh: ServerlessDatabase;
}

export async function withAdminServerComponentRouteGuard(
  server_component: TProtectedAdminPageServerComponent<IProtectedAdminServerComponentPageProps>
): Promise<ReactElement> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH()
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return await _withAdminServerComponentRouteGuard<IProtectedAdminServerComponentPageProps>(
    server_component,
    { dbh },
    {
      route_guard_type: "admin",
      custom_is_authorized_check: async (props): Promise<boolean> => props.user.admin === true,
      jwt_keys_manager,
      api_server_id: SCHEMAVAULTS_AUTH_APP_ID
    }
  )
}

export interface IProtectedAdminApiRouteProps extends IBaseProtectedAdminApiRouteInputs {
  dbh: ServerlessDatabase;
}

export async function withAdminApiRouteGuard(
  api_server_handler: TProtectedAdminApiRoute<IProtectedAdminApiRouteProps>
): Promise<(req: NextRequest) => Promise<NextResponse>> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH()
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return _withAdminApiRouteGuard<IProtectedAdminApiRouteProps>(
    api_server_handler,
    { dbh },
    {
      custom_is_authorized_check: async (props) => props.user.admin === true,
      api_server_id: SCHEMAVAULTS_AUTH_APP_ID,
      jwt_keys_manager
    }
  );
}

export type { IProtectedAdminApiRouteProps as IProtectedAdminApiRouteInputs }
