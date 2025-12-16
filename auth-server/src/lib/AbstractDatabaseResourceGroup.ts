import { sql, type Kysely } from "@schemavaults/dbh";
import type { IDatabaseResourceGroup } from "./IDatabaseResourceGroup";
import type { AuthDatabase } from "./auth-db/auth-database-types";

export abstract class AbstractDatabaseResourceGroup
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
    const tableExists = sql`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = '${table_name}'
      ) AS exists;
    `.execute(this.db);

    const result = await tableExists;
    const exists: boolean =
      typeof result.rows[0] === "object" &&
      result.rows[0] !== null &&
      "exists" in result.rows[0] &&
      !!result.rows[0].exists;
    return exists;
  }
}

export default AbstractDatabaseResourceGroup;
