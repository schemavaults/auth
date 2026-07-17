// serverless-database.ts
// This file sets up kysely to connect to the auth-server's Postgres database.
//
// Which @schemavaults/dbh adapter is used is selected at runtime by the
// SCHEMAVAULTS_DBH_ADAPTER environment variable (read via dbh's own
// getDbhAdapterTypeFromEnv, which throws on invalid values):
//   - "postgres-neon-proxy" (default): connect through a Neon-compatible
//     WebSocket proxy (serverless/edge-friendly; the historical behavior).
//   - "postgres": direct TCP connection via a pg Pool. Used by the
//     single-VM docker compose deployment in deploy/, where Postgres runs
//     alongside the server and no WebSocket proxy exists.

import type { AuthDatabase } from "./auth-database-types";
import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import {
  getDbhAdapterTypeFromEnv,
  SchemaVaultsPostgresAdapter,
  SchemaVaultsPostgresNeonProxyAdapter,
  type IGetPostgresNeonWsProxyUrlOpts,
  type Kysely,
  type SchemaVaultsDbhAdapterType,
} from "@schemavaults/dbh";

type AuthServerDbhAdapter =
  | SchemaVaultsPostgresAdapter<AuthDatabase>
  | SchemaVaultsPostgresNeonProxyAdapter<AuthDatabase>;

export class ServerlessDatabase implements AsyncDisposable {
  private readonly adapter: AuthServerDbhAdapter;

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

  private static createAdapter(): AuthServerDbhAdapter {
    const environment =
      getAppEnvironment() satisfies SchemaVaultsAppEnvironment;
    const adapter_type: SchemaVaultsDbhAdapterType =
      getDbhAdapterTypeFromEnv() ?? "postgres-neon-proxy";
    if (adapter_type === "postgres") {
      return new SchemaVaultsPostgresAdapter<AuthDatabase>({ environment });
    }
    return new SchemaVaultsPostgresNeonProxyAdapter<AuthDatabase>({
      environment,
      wsProxyUrl: ServerlessDatabase.resolveWsProxyUrl,
    });
  }

  private constructor() {
    this.adapter = ServerlessDatabase.createAdapter();
  }

  public static createDBH(): ServerlessDatabase {
    return new ServerlessDatabase();
  }

  public get db(): Kysely<AuthDatabase> {
    return this.adapter.db;
  }

  public async destroy(): Promise<void> {
    await this.adapter.destroy();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    await this.destroy();
  }
}

export default ServerlessDatabase;
