import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { type SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import { UserRegistry } from "@/lib/auth-db";
import { OrganizationsRegistry } from "@/lib/auth-db";
import { loadUserData } from "@/lib/auth-db/users/load-user-by-uid";
import { AuthServerJwtKeysManager } from "@/lib/AuthServerJwtKeysManager";
import generateRefreshToken from "@/lib/AuthServerJwtKeysManager/generateRefreshToken";
import getHostname from "@/lib/hostname";
import setRefreshTokenCookieOnResponse from "@/lib/setRefreshTokenCookieOnResponse";

export interface SetAuthServerRefreshTokenCookieOpts {
  uid: string;
  db: Kysely<AuthDatabase>;
  req: NextRequest;
  res: NextResponse;
  environment: SchemaVaultsAppEnvironment;
  debug?: boolean;
}

export default async function setAuthServerRefreshTokenCookie({
  uid,
  db,
  req,
  res,
  environment,
  debug = false,
}: SetAuthServerRefreshTokenCookieOpts): Promise<void> {
  const userRegistry = new UserRegistry(db, debug);
  const orgRegistry = new OrganizationsRegistry(db, debug);

  const userData = await loadUserData(uid, userRegistry);
  const userOrgs = await orgRegistry.listUserOrganizationMembershipIds(uid, userData.admin);

  const auth_jwt_manager = new AuthServerJwtKeysManager(db);
  const refresh_token = await generateRefreshToken({
    auth_jwt_manager,
    client_app_id: getAuthServerAppId(),
    user: userData,
    user_organizations: userOrgs,
    environment,
  });

  const hostname = getHostname(req);
  const secure: boolean = environment !== "development" && environment !== "test";

  await setRefreshTokenCookieOnResponse({
    refresh_token,
    client_app_id: getAuthServerAppId(),
    req,
    res,
    secure,
    hostname,
    debug,
  });
}
