import type { JWKS } from "@schemavaults/jwt";
import type { IJsonWebKeySetsStore } from "./JsonWebKeySetsStore";
import type { IJwtKeyManager } from "./IJwtKeyManager";

export abstract class DatabaseConnectedJwtKeyManager implements IJwtKeyManager {
  protected readonly store: IJsonWebKeySetsStore;

  public constructor(store: IJsonWebKeySetsStore) {
    this.store = store;
  }

  public async loadJwks(audienceId: string): Promise<JWKS> {
    const jwks: JWKS = await this.store.getJwks(audienceId);
    if (
      !("keys" in jwks) ||
      !Array.isArray(jwks.keys) ||
      jwks.keys.length === 0
    ) {
      throw new TypeError(
        "Expected loaded JWKS to have a non-empty 'keys' array property!",
      );
    }
    return jwks;
  }
}

export default DatabaseConnectedJwtKeyManager;
