
export interface IJsonWebKeyStore {
  get(keyId: string): Promise<object | undefined>;
  set(keyId: string, key: object): Promise<void>;
  delete(keyId: string): Promise<void>;
}
