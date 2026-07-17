// serverless-database.ts
// This file sets up kysely to connect to the auth-server's Postgres database.
//
// Which @schemavaults/dbh adapter is used is selected at runtime by the
// SCHEMAVAULTS_DBH_ADAPTER environment variable:
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
  SchemaVaultsPostgresAdapter,
  SchemaVaultsPostgresNeonProxyAdapter,
  type IGetPostgresNeonWsProxyUrlOpts,
  type Kysely,
} from "@schemavaults/dbh";

export const AUTH_SERVER_DBH_ADAPTER_TYPES = [
  "postgres",
  "postgres-neon-proxy",
] as const;

export type AuthServerDbhAdapterType =
  (typeof AUTH_SERVER_DBH_ADAPTER_TYPES)[number];

export const DEFAULT_AUTH_SERVER_DBH_ADAPTER: AuthServerDbhAdapterType =
  "postgres-neon-proxy";

function isAuthServerDbhAdapterType(
  value: string,
): value is AuthServerDbhAdapterType {
  return (AUTH_SERVER_DBH_ADAPTER_TYPES as readonly string[]).includes(value);
}

/**
 * Resolve which @schemavaults/dbh adapter this deployment connects to
 * Postgres with, from the SCHEMAVAULTS_DBH_ADAPTER environment variable.
 * Resolved at call time (never frozen at build time) so a single build works
 * across deployment modes. Throws if the variable is set but invalid.
 */
export function getAuthServerDbhAdapterType(): AuthServerDbhAdapterType {
  const raw: string | undefined = process.env.SCHEMAVAULTS_DBH_ADAPTER;
  if (typeof raw !== "string" || raw.length === 0) {
    return DEFAULT_AUTH_SERVER_DBH_ADAPTER;
  }
  if (!isAuthServerDbhAdapterType(raw)) {
    throw new Error(
      `Invalid SCHEMAVAULTS_DBH_ADAPTER: "${raw}" (expected one of: ${AUTH_SERVER_DBH_ADAPTER_TYPES.join(", ")})`,
    );
  }
  return raw;
}

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
    const adapter_type: AuthServerDbhAdapterType = getAuthServerDbhAdapterType();
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
