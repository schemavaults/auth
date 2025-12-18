import { I_JWT_Keys } from "@schemavaults/jwt";
import AbstractJsonWebKeySetsStore from "./AbstractJsonWebKeySetsStore";
import { IJsonWebKeySetsStore } from "./IJsonWebKeySetsStore";

export class MockJwtKeySetsStore
  extends AbstractJsonWebKeySetsStore
  implements IJsonWebKeySetsStore
{
  public async hasBeenInitialized(): Promise<boolean> {
    return true;
  }

  public async performSetupTasks(): Promise<void> {
    return;
  }
  private _map: Map<string, Map<string, I_JWT_Keys>> = new Map();

  public get(audienceId: string, keySetId: string): Promise<I_JWT_Keys | null> {
    return new Promise((resolve): void => {
      const audienceKeysets: Map<string, I_JWT_Keys> | null =
        this._map.get(audienceId) ?? null;
      if (!audienceKeysets) {
        return resolve(null);
      }
      const keyset: I_JWT_Keys | null = audienceKeysets.get(keySetId) ?? null;
      return resolve(keyset ?? null);
    });
  }

  public has(audienceId: string, keySetId: string): Promise<boolean> {
    return new Promise((resolve): void => {
      const audienceKeysets: Map<string, I_JWT_Keys> | null =
        this._map.get(audienceId) ?? null;
      if (!audienceKeysets) {
        return resolve(false);
      }
      return resolve(audienceKeysets.has(keySetId));
    });
  }

  public storeKeySet(keys: I_JWT_Keys): Promise<void> {
    const audience_id: string = keys.audience_id;
    const keyset_id: string = keys.keyset_id;
    return new Promise((resolve, reject): void => {
      // create keysets map for audience if it doesnt exist
      if (!this._map.has(audience_id)) {
        this._map.set(audience_id, new Map([[keyset_id, keys]]));
        return resolve();
      } else {
        // already exists, throw if keyset already exists
        const keyset_map: Map<string, I_JWT_Keys> = this._map.get(audience_id)!;
        if (keyset_map.has(keyset_id)) {
          reject(
            new Error(
              `Keyset ${keyset_id} already exists for audience ${audience_id}`,
            ),
          );
        }
        keyset_map.set(keyset_id, keys);
        return resolve();
      }
    });
  }

  public delete(audienceId: string, keySetId: string): Promise<void> {
    return new Promise((resolve): void => {
      const audienceKeysetsMap = this._map.get(audienceId);
      if (!audienceKeysetsMap) {
        resolve();
        return;
      }
      audienceKeysetsMap.delete(keySetId);
      resolve();
    });
  }

  public listActiveKeySets(
    audienceId: string,
    currentTimestamp?: number,
  ): Promise<readonly I_JWT_Keys[]> {
    return new Promise((resolve): void => {
      const now: number =
        typeof currentTimestamp === "number" ? currentTimestamp : Date.now();

      const audienceKeysetsMap = this._map.get(audienceId);
      if (!audienceKeysetsMap) {
        return resolve([]);
      }

      const activeKeySets = audienceKeysetsMap
        .values()
        .filter((keyset) => keyset.keyset_expiry > now);
      return resolve([...activeKeySets]);
    });
  }

  public clearOutdatedKeySets(currentTimestamp?: number): Promise<void> {
    return new Promise((resolve) => {
      const now: number =
        typeof currentTimestamp === "number" ? currentTimestamp : Date.now();

      for (const audienceKeysetsMap of this._map.values()) {
        for (const keyset of audienceKeysetsMap.values()) {
          if (keyset.keyset_expiry <= now) {
            audienceKeysetsMap.delete(keyset.keyset_id);
          }
        }
      }

      resolve();
    });
  }
}

export default MockJwtKeySetsStore;
