#!/usr/bin/env bun
// Apply the compiled auth-server database migrations over a direct TCP
// Postgres connection (SchemaVaultsPostgresAdapter, the adapter selected by
// SCHEMAVAULTS_DBH_ADAPTER=postgres).
//
// The `dbh migrate` CLI used by the dev:migrate / prod:migrate scripts
// connects through a Neon-compatible WebSocket proxy, which the single-VM
// docker compose stack in deploy/ intentionally does not run -- migrations
// for that stack are applied with this script instead. See deploy/README.md.
//
// Usage (from the monorepo root, after `bun install`):
//   1. Build the migrations:
//        (cd auth-server && bun run build:migrations)
//   2. Apply them (the deploy stack publishes Postgres on 127.0.0.1:5432;
//      POSTGRES_HOST is overridden because deploy/.env points at the compose
//      network hostname "postgres-db"):
//        POSTGRES_HOST=127.0.0.1 bun --env-file=deploy/.env auth-server/migrate-database-direct.ts
//
// Or run both steps via the package script (expects POSTGRES_* in the
// environment): cd auth-server && bun run prod:migrate:direct

import { existsSync } from "node:fs";
import { join } from "node:path";
import { SchemaVaultsPostgresAdapter } from "@schemavaults/dbh";
import { migrate, type IMigrationResult } from "@schemavaults/dbh/migrate";

type AdapterEnvironment = ConstructorParameters<
  typeof SchemaVaultsPostgresAdapter
>[0]["environment"];

const migrationFolder: string =
  process.env.MIGRATIONS_PATH ?? join(import.meta.dir, "dist", "migrations");

if (!existsSync(migrationFolder)) {
  console.error(
    `Migrations directory not found: ${migrationFolder}\n` +
      "Build it first: cd auth-server && bun run build:migrations",
  );
  process.exit(1);
}

// The adapter validates this value at construction time.
const environment = (process.env.SCHEMAVAULTS_APP_ENVIRONMENT ??
  "production") as AdapterEnvironment;

const dbh = new SchemaVaultsPostgresAdapter<Record<string, unknown>>({
  environment,
});

try {
  console.log(
    `Applying migrations from ${migrationFolder} to postgres://${process.env.POSTGRES_HOST}:${process.env.POSTGRES_PORT ?? 5432}/${process.env.POSTGRES_DATABASE} ...`,
  );
  const results: readonly IMigrationResult[] = await migrate({
    db: dbh.db,
    migrationFolder,
  });
  if (results.length === 0) {
    console.log("Database is already up to date; no migrations to run.");
  }
  for (const result of results) {
    console.log(`  [${result.status}] ${result.migrationName}`);
  }
} finally {
  // A live pg Pool keeps the event loop alive; destroy it so the process
  // exits. (On migration failure migrate() throws and bun exits non-zero.)
  await dbh.destroy();
}
