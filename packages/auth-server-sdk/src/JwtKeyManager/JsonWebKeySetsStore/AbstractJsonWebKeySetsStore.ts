import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import type { IJsonWebKeySetsStore } from "./IJsonWebKeySetsStore";
import { to_public_jwks, type I_JWT_Keys } from "@schemavaults/jwt";

type JWKS = Awaited<ReturnType<typeof to_public_jwks>>;

export abstract class AbstractJsonWebKeySetsStore
  implements IJsonWebKeySetsStore
{
  abstract get(
    audienceId: string,
    keySetId: string,
  ): Promise<I_JWT_Keys | null>;
  abstract has(audienceId: string, keySetId: string): Promise<boolean>;
  abstract storeKeySet(keys: I_JWT_Keys): Promise<void>;
  abstract delete(audienceId: string, keySetId: string): Promise<void>;
  abstract listActiveKeySets(
    audienceId: string,
    currentTimestamp?: number,
  ): Promise<readonly I_JWT_Keys[]>;
  abstract clearOutdatedKeySets(currentTimestamp?: number): Promise<void>;

  public async getJwks(audienceId: ApiServerId): Promise<JWKS> {
    if (!apiServerIdSchema.safeParse(audienceId).success) {
      throw new Error("Invalid audience ID to load JWKS for!");
    }

    let keysets: readonly I_JWT_Keys[];
    try {
      keysets = await this.listActiveKeySets(audienceId);
    } catch (e: unknown) {
      console.error(
        `There was an error listing the active keysets for audience '${audienceId}':`,
        e,
      );
      throw new Error(
        `There was an error listing the active keysets for audience '${audienceId}'`,
      );
    }

    if (!Array.isArray(keysets)) {
      throw new TypeError(
        "Expected result of 'listActiveKeySets' to be an array!",
      );
    }

    if (keysets.length === 0) {
      console.warn(
        `[AbstractJsonWebKeySetsStore::getJwks(audience_id='${audienceId}')] listActiveKeySets returned an empty array!`,
      );
    }

    const jwks_promise: Promise<JWKS> = to_public_jwks(keysets);
    const jwks: JWKS = await jwks_promise;
    if (
      !("keys" in jwks) ||
      !Array.isArray(jwks.keys) ||
      jwks.keys.length === 0
    ) {
      throw new TypeError(
        "Expected loaded JWKS to have a non-empty 'keys' array property!",
      );
    }
    return jwks;
  }
}

export default AbstractJsonWebKeySetsStore;
