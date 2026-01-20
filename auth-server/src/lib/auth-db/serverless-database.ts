import "server-only";

// This file sets up kysely to connect to postgres-neon

import type { AuthDatabase } from "./auth-database-types";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import SchemaVaultsPostgresNeonProxyAdapter, {
  type IGetPostgresNeonWsProxyUrlOpts,
} from "@schemavaults/dbh";

export class ServerlessDatabase
  extends SchemaVaultsPostgresNeonProxyAdapter<AuthDatabase>
  implements AsyncDisposable
{
  private static resolveWsProxyUrl({
    environment,
    pg_host,
  }: IGetPostgresNeonWsProxyUrlOpts): string {
    if (environment === "development") {
      return "localhost:5433/v1";
    } else if (environment === "test") {
      return "postgres-ws-proxy:5433/v1";
    } else if (environment === "production") {
      return `${pg_host}/v2`;
    } else {
      throw new Error(
        "Not configured to resolve postgres-ws-proxy in this environment!",
      );
    }
  }

  private constructor() {
    super({
      environment: getAppEnvironment() satisfies SchemaVaultsAppEnvironment,
      wsProxyUrl: ServerlessDatabase.resolveWsProxyUrl,
    });
  }

  public static createDBH(): ServerlessDatabase {
    return new ServerlessDatabase();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy();
  }
}

export default ServerlessDatabase;
