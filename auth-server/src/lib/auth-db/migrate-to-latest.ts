import "server-only";
import { join } from "path";
import type { Kysely } from "@schemavaults/dbh";
import { existsSync, readdirSync } from "fs";
import ServerlessDatabase from "./serverless-database";

function resolveMigrationFolder(): string {
  // In production/Docker, use the explicitly set path
  if (process.env.MIGRATIONS_PATH) {
    return process.env.MIGRATIONS_PATH;
  }
  // In development, use __dirname relative path
  return join(__dirname, "migrations");
}

export default async function migrateToLatest(db: Kysely<any>): Promise<void> {
  const migrationFolder = resolveMigrationFolder()

  if (!existsSync(migrationFolder)) {
    throw new Error(`Failed to resolve migrations directory from path: '${migrationFolder}'`)
  }

  const children = readdirSync(migrationFolder);
  if (children.filter(s => s !== '.' && s !== '..' && s !== '.DS_Store').length === 0) {
    throw new Error(`Failed to find any migration definitions in migrations directory: '${migrationFolder}'`)
  }

  const migrate = await import("@schemavaults/dbh/migrate").then(mod => mod.migrate);
  return await migrate({
    db: db,
    migrationFolder,
    version: undefined // use latest
  })
}

if (require.main === module) {
  const runAsScript = async (): Promise<void> => {
    await using dbh = ServerlessDatabase.createDBH();
    await migrateToLatest(dbh.db);
  }
  runAsScript();
}
