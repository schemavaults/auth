import "server-only";
import { getAppEnvironment } from "@schemavaults/app-definitions";
import { RouteGuardFactory as BaseRouteGuardFactory } from "@schemavaults/auth-server-sdk";
import { AuthServerJwtKeysManager } from "./AuthServerJwtKeysManager";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export class RouteGuardFactory extends BaseRouteGuardFactory {
  public constructor(db: Kysely<AuthDatabase>) {
    super({
      environment: getAppEnvironment(),
      is_auth_server: true,
      jwt_keys_manager: new AuthServerJwtKeysManager(db),
    });
  }
}

export default RouteGuardFactory;
