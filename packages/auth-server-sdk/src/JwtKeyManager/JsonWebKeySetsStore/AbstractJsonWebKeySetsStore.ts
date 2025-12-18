import { apiServerIdSchema } from "@schemavaults/app-definitions";
import type { IJsonWebKeySetsStore } from "./IJsonWebKeySetsStore";
import { to_public_jwks, type I_JWT_Keys } from "@schemavaults/jwt";
import type { IDatabaseResourceGroup } from "@/DatabaseResourceGroup";

type JWKS = Awaited<ReturnType<typeof to_public_jwks>>;

export abstract class AbstractJsonWebKeySetsStore
  implements IJsonWebKeySetsStore, IDatabaseResourceGroup
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

  public async getJwks(audienceId: string): Promise<JWKS> {
    if (!apiServerIdSchema.safeParse(audienceId).success) {
      throw new Error("Invalid audience ID to load JWKS for!");
    }

    const keysets: readonly I_JWT_Keys[] =
      await this.listActiveKeySets(audienceId);
    const jwks_promise: Promise<JWKS> = to_public_jwks(keysets);
    return await jwks_promise;
  }

  abstract hasBeenInitialized(): Promise<boolean>;
  abstract performSetupTasks(): Promise<void>;
}

export default AbstractJsonWebKeySetsStore;
