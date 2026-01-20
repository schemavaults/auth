import "server-only";
import {
  withAdminServerComponentRouteGuard as _withAdminServerComponentRouteGuard,
  withAdminApiRouteGuard as _withAdminApiRouteGuard,
  type TProtectedAdminPageServerComponent,
  type TProtectedAdminApiRoute,
} from "@schemavaults/auth-server-sdk/route_guards";
import type { AuthDatabase } from "./auth-db/auth-database-types";
import ServerlessDatabase from "./auth-db/serverless-database";
import SCHEMAVAULTS_AUTH_APP_ID from "./SCHEMAVAULTS_AUTH_APP_ID";
import type { ApiServerId } from "@schemavaults/app-definitions";
import AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";

import type {
  IProtectedAdminApiRouteProps as _IProtectedAdminApiRouteProps,
  IProtectedAdminServerComponentPageProps as _IProtectedAdminServerComponentPageProps
} from "@schemavaults/auth-server-sdk/route_guards";
import { ReactElement } from "react";
import type { NextRequest, NextResponse } from "next/server";

export type IProtectedAdminApiRouteProps<Db extends AuthDatabase = AuthDatabase> = _IProtectedAdminApiRouteProps<Db>;
export type IProtectedAdminServerComponentPageProps<Db extends AuthDatabase = AuthDatabase> = _IProtectedAdminServerComponentPageProps<Db>;

export async function withAdminServerComponentRouteGuard(input: TProtectedAdminPageServerComponent<AuthDatabase>): Promise<ReactElement> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH()
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return await _withAdminServerComponentRouteGuard(input, dbh, jwt_keys_manager, (): ApiServerId => SCHEMAVAULTS_AUTH_APP_ID)
}

export async function withAdminApiRouteGuard(input: TProtectedAdminApiRoute<AuthDatabase>): Promise<(req: NextRequest) => Promise<NextResponse>> {
  await using dbh: ServerlessDatabase = ServerlessDatabase.createDBH()
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return _withAdminApiRouteGuard(input, dbh, jwt_keys_manager, (): ApiServerId => SCHEMAVAULTS_AUTH_APP_ID)
}
