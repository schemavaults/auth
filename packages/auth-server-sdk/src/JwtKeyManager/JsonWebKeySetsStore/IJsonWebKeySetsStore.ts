import type { I_JWT_Keys, to_public_jwks } from "@schemavaults/jwt";

type JWKS = Awaited<ReturnType<typeof to_public_jwks>>;

export interface IJsonWebKeySetsStore {
  get(keySetId: string): Promise<I_JWT_Keys | null>;
  has(keySetId: string): Promise<boolean>;
  storeKeySet(keys: I_JWT_Keys): Promise<void>;
  delete(keySetId: string): Promise<void>;
  listActiveKeySets(currentTimestamp?: number): Promise<readonly I_JWT_Keys[]>;
  clearOutdatedKeySets(currentTimestamp?: number): Promise<void>;
  getJwks(): Promise<JWKS>;
}
