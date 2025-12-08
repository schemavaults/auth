import { type IJwtKeyManager, DatabaseConnectedJwtKeyManager } from "@schemavaults/auth-server-sdk";
import AuthServerJwtKeysStore from "@/lib/auth-db/jwt_keys/AuthServerJwtKeysStore";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

export class AuthServerJwtKeysManager extends DatabaseConnectedJwtKeyManager implements IJwtKeyManager {
  public constructor(dbh: Kysely<AuthDatabase>) {
    super(new AuthServerJwtKeysStore(dbh))
  }
}

export default AuthServerJwtKeysManager;
