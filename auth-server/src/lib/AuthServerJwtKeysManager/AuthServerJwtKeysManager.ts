import {
  type IJwtKeyManager,
  DatabaseConnectedJwtKeyManager
} from "@schemavaults/auth-server-sdk";
import AuthServerJwtKeysStore from "@/lib/auth-db/jwt_keys/AuthServerJwtKeysStore";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  generateNewJwtKeySet,
  refreshTokenExpiry,
  type I_JWT_Keys,
} from "@schemavaults/jwt";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import isValidUuid from "@/lib/is-valid-uuid";

export class AuthServerJwtKeysManager
  extends DatabaseConnectedJwtKeyManager
  implements IJwtKeyManager
{
  private static readonly refresh_token_valid_duration_ms: number =
    refreshTokenExpiry * 1000;
  private static readonly keyset_valid_duration_ms: number =
    refreshTokenExpiry * 3 * 1000;

  public constructor(dbh: Kysely<AuthDatabase>) {
    super(new AuthServerJwtKeysStore(dbh));
  }

  private static isValidApiServerId(val: unknown): val is ApiServerId {
    return typeof val === "string" && apiServerIdSchema.safeParse(val).success;
  }

  private isValidApiServerId(val: unknown): val is ApiServerId {
    return AuthServerJwtKeysManager.isValidApiServerId(val);
  }

  /**
   * @description Generates a new keyset object (WITHOUT saving it)
   * @param audience_id API server that this keyset is for
   * @returns The generated JWT_Keys keyset
   */
  private async generateNewJwtKeySet(audience_id: ApiServerId): Promise<I_JWT_Keys> {
    if (!this.isValidApiServerId(audience_id)) {
      throw new TypeError("Invalid audience ID to generate new JWT keyset for!");
    }

    const newKeySet: I_JWT_Keys = await generateNewJwtKeySet({
      keyset_expiry:
        Date.now() + AuthServerJwtKeysManager.keyset_valid_duration_ms,
      audience_id,
    });

    if (!this.isValidKeysetId(newKeySet.keyset_id)) {
      throw new Error("Invalid keyset ID for generated keyset!");
    }

    return newKeySet;
  }

  private async storeKeySet(keyset: I_JWT_Keys): Promise<void> {
    return await this.store.storeKeySet(keyset);
  }

  private async createAndSaveNewJwtKeySet(
    audience_id: ApiServerId,
  ): Promise<I_JWT_Keys> {
    if (!this.isValidApiServerId(audience_id)) {
      throw new TypeError("Invalid audience ID to create and save new JWT keyset for!");
    }

    const newKeySet: I_JWT_Keys = await this.generateNewJwtKeySet(audience_id);

    try {
      await this.storeKeySet(newKeySet);
    } catch (e: unknown) {
      console.error("Failed to store key set after successful creation: ", e);
      throw new Error("Failed to store key set after successful creation!")
    }

    return newKeySet;
  }

  private static willKeysetExpireBeforeNewRefreshToken(
    keyset: I_JWT_Keys,
  ): boolean {
    // if a refresh token was issued right now, what time would it expire?
    const new_refresh_token_expiry =
      Date.now() + this.refresh_token_valid_duration_ms + 2000;

    const willKeysetExpireBeforeNewRefreshToken: boolean =
      keyset.keyset_expiry < new_refresh_token_expiry;
    return willKeysetExpireBeforeNewRefreshToken;
  }

  /**
   *
   * @returns A keyset that can sign tokens (and will not expire before those tokens could potentially be used)
   */
  public async getFreshEnoughKeysetOrCreateNew(
    audience_id: string,
  ): Promise<I_JWT_Keys> {
    if (!this.isValidApiServerId(audience_id)) {
      throw new TypeError("Invalid audience ID");
    }

    const keysets = await this.store.listActiveKeySets(audience_id);
    if (!Array.isArray(keysets)) {
      throw new Error("Failed to retrieve active keysets list");
    }

    let freshEnoughKeyset: I_JWT_Keys | undefined;
    for (const keyset of keysets) {
      if (
        !AuthServerJwtKeysManager.willKeysetExpireBeforeNewRefreshToken(keyset)
      ) {
        freshEnoughKeyset = keyset;
        break;
      }
    }

    if (keysets.length === 0 || !freshEnoughKeyset) {
      try {
        return await this.createAndSaveNewJwtKeySet(audience_id);
      } catch (error) {
        console.error("Failed to create or save new JWT key set:", error);
        throw new Error("Failed to create or save new JWT key set");
      }
    }

    return freshEnoughKeyset;
  }

  private isValidKeysetId(keysetId: string): boolean {
    return isValidUuid(keysetId);
  }

  public async getKeyset(
    audience_id: ApiServerId,
    keyset_id: string,
  ): Promise<I_JWT_Keys> {
    if (!this.isValidApiServerId(audience_id)) {
      throw new TypeError("Invalid audience ID");
    }
    if (!this.isValidKeysetId(keyset_id)) {
      throw new TypeError("Invalid keyset ID");
    }

    const keyset = await this.store.get(audience_id, keyset_id);
    if (!keyset) {
      throw new Error(`Keyset with ID '${keyset_id}' not found`);
    }
    if (keyset.keyset_expiry <= Date.now()) {
      throw new Error(`Keyset with ID '${keyset_id}' has expired`);
    }
    return keyset;
  }

  /**
   * @name createAndSaveKeysetIfNoneExists
   * @description Initially created for the /api/jwks/{audience_api_server_id} endpoint.
   * Creates and saves a new keyset if no active keys exist for the audience.
   * Does nothing if active keys already exist.
   */
  public async createAndSaveKeysetIfNoneExists(audience_id: ApiServerId): Promise<void> {
    if (!this.isValidApiServerId(audience_id)) {
      throw new TypeError("Invalid audience ID");
    }

    const activeKeysets = await this.store.listActiveKeySets(audience_id);
    if (activeKeysets.length > 0) {
      return;
    }

    await this.createAndSaveNewJwtKeySet(audience_id);
  }

  public isConfigured(): boolean {
    return true;
  }
}

export default AuthServerJwtKeysManager;
