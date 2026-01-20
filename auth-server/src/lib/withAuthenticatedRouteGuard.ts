import "server-only";
import {
  withAuthenticatedServerComponentRouteGuard as _withAuthenticatedServerComponentRouteGuard,
  withAuthenticatedApiRouteGuard as _withAuthenticatedApiRouteGuard,
  type TProtectedAuthenticatedPageServerComponent,
  type TProtectedAuthenticatedApiRoute,
} from "@schemavaults/auth-server-sdk/route_guards";
import type { AuthDatabase } from "./auth-db/auth-database-types";
import { ServerlessDatabase } from "./auth-db";
import SCHEMAVAULTS_AUTH_APP_ID from "./SCHEMAVAULTS_AUTH_APP_ID";
import type { ApiServerId } from "@schemavaults/app-definitions";
import AuthServerJwtKeysManager from "./AuthServerJwtKeysManager";

import type {
  IProtectedAuthenticatedApiRouteProps as _IProtectedAuthenticatedApiRouteProps,
  IProtectedAuthenticatedServerComponentPageProps as _IProtectedAuthenticatedServerComponentPageProps
} from "@schemavaults/auth-server-sdk/route_guards";
import { NextRequest, NextResponse } from "next/server";

export type IProtectedAuthenticatedApiRouteProps<Db extends AuthDatabase = AuthDatabase> = _IProtectedAuthenticatedApiRouteProps<Db>;
export type IProtectedAuthenticatedServerComponentPageProps<Db extends AuthDatabase = AuthDatabase> = _IProtectedAuthenticatedServerComponentPageProps<Db>;

export async function withAuthenticatedServerComponentRouteGuard(input: TProtectedAuthenticatedPageServerComponent<AuthDatabase>) {
  await using dbh = ServerlessDatabase.createDBH();
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return _withAuthenticatedServerComponentRouteGuard(input, dbh, jwt_keys_manager, (): ApiServerId => SCHEMAVAULTS_AUTH_APP_ID)
}

export async function withAuthenticatedApiRouteGuard(input: TProtectedAuthenticatedApiRoute<AuthDatabase>): Promise<(req: NextRequest) => Promise<NextResponse>> {
  await using dbh = ServerlessDatabase.createDBH();
  const jwt_keys_manager = new AuthServerJwtKeysManager(dbh.db)
  return _withAuthenticatedApiRouteGuard(input, dbh, jwt_keys_manager, (): ApiServerId => SCHEMAVAULTS_AUTH_APP_ID)
}
