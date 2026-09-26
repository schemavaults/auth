import "server-only";
import { getAppEnvironment } from "@schemavaults/app-definitions";
import { RouteGuardFactory as BaseRouteGuardFactory } from "@schemavaults/auth-server-sdk";
import { AuthServerJwtKeysManager } from "./AuthServerJwtKeysManager";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { RedisCache } from "@/lib/redis";
import { createRouteGuardTokenRevocationCheck } from "@/lib/token-revocation";

/**
 * The auth server's route guard factory: verifies tokens with the local
 * keyset store AND rejects verified tokens that have since been revoked
 * (logout jti revocation / the `tokens_valid_after` watermark bumped by a
 * password reset and pinned while the account is disabled).
 * Pass a Redis connection to serve the watermark from cache.
 */
export class RouteGuardFactory extends BaseRouteGuardFactory {
  public constructor(db: Kysely<AuthDatabase>, redis?: RedisCache | null) {
    super({
      environment: getAppEnvironment(),
      is_auth_server: true,
      jwt_keys_manager: new AuthServerJwtKeysManager(db),
      is_token_revoked: createRouteGuardTokenRevocationCheck({ db, redis }),
    });
  }
}

export default RouteGuardFactory;
