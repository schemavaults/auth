import type { JWKS } from "@schemavaults/jwt";
import type { IJsonWebKeySetsStore } from "./JsonWebKeySetsStore";
import type { IJwtKeyManager } from "./IJwtKeyManager";
import type { IDatabaseResourceGroup } from "@/DatabaseResourceGroup";

export class DatabaseConnectedJwtKeyManager
  implements IJwtKeyManager, IDatabaseResourceGroup
{
  protected readonly store: IJsonWebKeySetsStore & IDatabaseResourceGroup;

  public constructor(store: IJsonWebKeySetsStore & IDatabaseResourceGroup) {
    this.store = store;
  }

  public async loadJwks(audienceId: string): Promise<JWKS> {
    return await this.store.getJwks(audienceId);
  }

  public async hasBeenInitialized(): Promise<boolean> {
    return await this.store.hasBeenInitialized();
  }

  public async performSetupTasks(): Promise<void> {
    return await this.store.performSetupTasks();
  }
}

export default DatabaseConnectedJwtKeyManager;
