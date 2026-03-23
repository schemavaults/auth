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
    if (!("keys" in jwks) || !Array.isArray(jwks.keys)) {
      throw new TypeError(
        "Expected loaded JWKS to have a 'keys' array property!",
      );
    }
    return jwks;
  }

  public abstract isConfigured(): boolean;
}

export default DatabaseConnectedJwtKeyManager;
