import "server-only";

// This file sets up kysely to connect to postgres-neon

import type { AuthDatabase } from "./auth-database-types";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { SchemaVaultsPostgresNeonProxyAdapter } from "@schemavaults/dbh";

export class ServerlessDatabase
  extends SchemaVaultsPostgresNeonProxyAdapter<AuthDatabase>
  implements AsyncDisposable
{
  private constructor() {
    super({
      environment: getAppEnvironment() satisfies SchemaVaultsAppEnvironment,
    });
  }

  public static createDBH(): ServerlessDatabase {
    return new ServerlessDatabase();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy();
  }
}
