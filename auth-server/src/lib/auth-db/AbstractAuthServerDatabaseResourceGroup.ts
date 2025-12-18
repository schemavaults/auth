import type { Kysely } from "@schemavaults/dbh";
import type { IDatabaseResourceGroup } from "@schemavaults/auth-server-sdk";
import hasTableBeenInitialized from "./hasTableBeenInitialized";
import type { AuthDatabase } from "./auth-database-types";

export abstract class AbstractAuthServerDatabaseResourceGroup
  implements IDatabaseResourceGroup
{
  public abstract hasBeenInitialized(): Promise<boolean>;
  public abstract performSetupTasks(): Promise<void>;

  public constructor(
    protected db: Kysely<AuthDatabase>,
    protected initialized: boolean = false,
  ) {}

  protected async hasTableBeenInitialized(
    table_name: string,
  ): Promise<boolean> {
    return await hasTableBeenInitialized(this.db, table_name);
  }
}

export default AbstractAuthServerDatabaseResourceGroup;
