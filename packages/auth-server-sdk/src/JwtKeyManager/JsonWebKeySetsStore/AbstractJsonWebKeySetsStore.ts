import { IJsonWebKeySetsStore } from "./IJsonWebKeySetsStore";
import {  to_public_jwks, type I_JWT_Keys } from "@schemavaults/jwt";

type JWKS = Awaited<ReturnType<typeof to_public_jwks>>;


export abstract class AbstractJsonWebKeySetsStore implements IJsonWebKeySetsStore {
  abstract get(keySetId: string): Promise<I_JWT_Keys | null>;
  abstract has(keySetId: string): Promise<boolean>;
  abstract storeKeySet(keys: I_JWT_Keys): Promise<void>;
  abstract delete(keySetId: string): Promise<void>;
  abstract listActiveKeySets(currentTimestamp?: number): Promise<readonly I_JWT_Keys[]>;
  abstract clearOutdatedKeySets(currentTimestamp?: number): Promise<void>;

  public async getJwks(): Promise<JWKS> {
    const keysets: readonly I_JWT_Keys[] = await this.listActiveKeySets();
    const jwks_promise: Promise<JWKS> = to_public_jwks(keysets);
    return await jwks_promise;
  };
}

export default AbstractJsonWebKeySetsStore;
