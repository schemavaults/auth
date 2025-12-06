import type { JWT_Keys, to_public_jwks } from "@/jwt/jwt_keys";

type JWKS = Awaited<ReturnType<typeof to_public_jwks>>;

export interface IJsonWebKeySetsStore {
  get(keySetId: string): Promise<JWT_Keys | null>;
  has(keySetId: string): Promise<boolean>;
  storeKeySet(keys: JWT_Keys): Promise<void>;
  delete(keySetId: string): Promise<void>;
  listActiveKeySets(): Promise<readonly JWT_Keys[]>;
  clearOutdatedKeySets(): Promise<void>;
  getJwks(): Promise<JWKS>;
}
