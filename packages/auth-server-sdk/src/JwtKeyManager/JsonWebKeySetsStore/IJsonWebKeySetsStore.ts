import type { I_JWT_Keys, to_public_jwks } from "@schemavaults/jwt";

type JWKS = Awaited<ReturnType<typeof to_public_jwks>>;

export interface IJsonWebKeySetsStore {
  get(audienceId: string, keySetId: string): Promise<I_JWT_Keys | null>;
  has(audienceId: string, keySetId: string): Promise<boolean>;
  storeKeySet(keys: I_JWT_Keys): Promise<void>;
  delete(audienceId: string, keySetId: string): Promise<void>;
  listActiveKeySets(
    audienceId: string,
    currentTimestamp?: number,
  ): Promise<readonly I_JWT_Keys[]>;
  clearOutdatedKeySets(currentTimestamp?: number): Promise<void>;
  getJwks(audienceId: string): Promise<JWKS>;
}
