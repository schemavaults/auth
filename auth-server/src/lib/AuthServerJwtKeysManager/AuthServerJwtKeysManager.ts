import { type IJwtKeyManager, DatabaseConnectedJwtKeyManager } from "@schemavaults/auth-server-sdk";
import AuthServerJwtKeysStore from "@/lib/auth-db/jwt_keys/AuthServerJwtKeysStore";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { generateNewJwtKeySet, refreshTokenExpiry, type I_JWT_Keys } from "@schemavaults/jwt";

export class AuthServerJwtKeysManager extends DatabaseConnectedJwtKeyManager implements IJwtKeyManager {
  private static readonly refresh_token_valid_duration: number = refreshTokenExpiry;
  private static readonly keyset_valid_duration: number = refreshTokenExpiry * 3;

  public constructor(dbh: Kysely<AuthDatabase>) {
    super(new AuthServerJwtKeysStore(dbh))
  }

  private async createAndSaveNewJwtKeySet(): Promise<I_JWT_Keys> {
    const newKeySet: I_JWT_Keys = await generateNewJwtKeySet({
      keyset_expiry: Date.now() + AuthServerJwtKeysManager.keyset_valid_duration
    });
    await this.store.storeKeySet(newKeySet);
    return newKeySet;
  }

  private static willKeysetExpireBeforeNewRefreshToken(keyset: I_JWT_Keys): boolean {
    // if a refresh token was issued right now, what time would it expire?
    const new_refresh_token_expiry = Date.now() + this.refresh_token_valid_duration + 2000;

    const willKeysetExpireBeforeNewRefreshToken: boolean = keyset.keyset_expiry < new_refresh_token_expiry;
    return willKeysetExpireBeforeNewRefreshToken;
  }

  /**
   *
   * @returns A keyset that can sign tokens (and will not expire before those tokens could potentially be used)
   */
  public async getFreshEnoughKeysetOrCreateNew(): Promise<I_JWT_Keys> {
    const keysets = await this.store.listActiveKeySets();
    if (!Array.isArray(keysets)) {
      throw new Error("Failed to retrieve active keysets list");
    }

    let freshEnoughKeyset: I_JWT_Keys | undefined;
    for (const keyset of keysets) {
      if (!AuthServerJwtKeysManager.willKeysetExpireBeforeNewRefreshToken(keyset)) {
        freshEnoughKeyset = keyset;
        break;
      }
    }

    if (keysets.length === 0 || !freshEnoughKeyset) {
      try {
        return await this.createAndSaveNewJwtKeySet();
      } catch (error) {
        console.error("Failed to create or save new JWT key set:", error);
        throw new Error("Failed to create or save new JWT key set");
      }
    }

    return freshEnoughKeyset;
  }

  public async getKeyset(keyset_id: string): Promise<I_JWT_Keys> {
    const keyset = await this.store.get(keyset_id);
    if (!keyset) {
      throw new Error(`Keyset with ID '${keyset_id}' not found`);
    }
    if (keyset.keyset_expiry <= Date.now()) {
      throw new Error(`Keyset with ID '${keyset_id}' has expired`);
    }
    return keyset;
  }
}

export default AuthServerJwtKeysManager;
