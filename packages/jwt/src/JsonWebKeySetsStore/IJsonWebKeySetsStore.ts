import type { JWT_Keys } from "@/jwt/jwt_keys";

export interface IJsonWebKeySetsStore {
  get(keySetId: string): Promise<JWT_Keys | null>;
  set(keySetId: string, keys: JWT_Keys): Promise<void>;
  delete(keySetId: string): Promise<void>;
  listActiveKeySets(): Promise<readonly JWT_Keys[]>;
  clearOutdatedKeySets(): Promise<void>;
  getLatestKeySet(): Promise<JWT_Keys | null>;
}
