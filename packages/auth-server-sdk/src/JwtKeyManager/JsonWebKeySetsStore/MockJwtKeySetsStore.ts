import { I_JWT_Keys } from "@schemavaults/jwt";
import AbstractJsonWebKeySetsStore from "./AbstractJsonWebKeySetsStore";
import { IJsonWebKeySetsStore } from "./IJsonWebKeySetsStore";

export class MockJwtKeySetsStore extends AbstractJsonWebKeySetsStore implements IJsonWebKeySetsStore {
  private _map: Map<string, I_JWT_Keys> = new Map();

  public get(keySetId: string): Promise<I_JWT_Keys | null> {
    return new Promise((resolve): void => resolve(this._map.get(keySetId) ?? null))
  }

  public has(keySetId: string): Promise<boolean> {
    return new Promise((resolve): void => resolve(this._map.has(keySetId)))
  }

  public storeKeySet(keys: I_JWT_Keys): Promise<void> {
    return new Promise((resolve, reject): void => {
      if (this._map.has(keys.keyset_id)) {
        reject(new Error("Keyset already exists"))
      }
      this._map.set(keys.keyset_id, keys);
      resolve();
    });
  }

  public delete(keySetId: string): Promise<void> {
    return new Promise((resolve): void => {
      this._map.delete(keySetId);
      resolve();
    });
  }

  public listActiveKeySets(currentTimestamp?: number): Promise<readonly I_JWT_Keys[]> {
    return new Promise((resolve): void => {
      const now: number = typeof currentTimestamp === 'number' ? currentTimestamp : Date.now();
      const activeKeySets = this._map.values().filter(keyset => keyset.keyset_expiry > now)
      return resolve([...activeKeySets]);
    });
  }

  public clearOutdatedKeySets(currentTimestamp?: number): Promise<void> {
    return new Promise((resolve) => {
      const now: number = typeof currentTimestamp === 'number' ? currentTimestamp : Date.now();
      const outdatedKeySets = this._map.values().filter(keyset => keyset.keyset_expiry <= now)
      outdatedKeySets.forEach(keyset => this._map.delete(keyset.keyset_id))
      resolve();
    })
  }
}

export default MockJwtKeySetsStore
