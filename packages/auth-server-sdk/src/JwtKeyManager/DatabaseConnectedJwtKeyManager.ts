import type { JWKS } from "@schemavaults/jwt";
import type { IJsonWebKeySetsStore } from "./JsonWebKeySetsStore";
import type { IJwtKeyManager } from "./IJwtKeyManager";

export class DatabaseConnectedJwtKeyManager implements IJwtKeyManager {
  private readonly store: IJsonWebKeySetsStore;

  public constructor(store: IJsonWebKeySetsStore) {
    this.store = store;
  }

  public async loadJwks(): Promise<JWKS> {
    return await this.store.getJwks();
  }
}

export default DatabaseConnectedJwtKeyManager;
