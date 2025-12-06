import type JWT_Keys from "@/jwt/jwt_keys";
import { IJsonWebKeySetsStore } from "./IJsonWebKeySetsStore";
import { to_public_jwks } from "@/jwt/jwt_keys";

type JWKS = Awaited<ReturnType<typeof to_public_jwks>>;


export abstract class AbstractJsonWebKeySetsStore implements IJsonWebKeySetsStore {
  abstract get(keySetId: string): Promise<JWT_Keys | null>;
  abstract has(keySetId: string): Promise<boolean>;
  abstract storeKeySet(keys: JWT_Keys): Promise<void>;
  abstract delete(keySetId: string): Promise<void>;
  abstract listActiveKeySets(): Promise<readonly JWT_Keys[]>;
  abstract clearOutdatedKeySets(): Promise<void>;

  public async getJwks(): Promise<JWKS> {
    const keysets: readonly JWT_Keys[] = await this.listActiveKeySets();
    const jwks_promise: Promise<JWKS> = to_public_jwks(keysets);
    return await jwks_promise;
  };
}

export default AbstractJsonWebKeySetsStore;
