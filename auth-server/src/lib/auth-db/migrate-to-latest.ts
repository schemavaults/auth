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

export default async function migrateToLatest(db: Kysely<any>, migrationFolder: string = resolveMigrationFolder()) {
  if (typeof migrationFolder !== 'string') {
    throw new TypeError("Expected 'migrationFolder' to be a string!");
  }

  if (!existsSync(migrationFolder)) {
    throw new Error(`Failed to resolve migrations directory from path: '${migrationFolder}'`)
  }

  const children = readdirSync(migrationFolder);
  if (children.filter(s => s !== '.' && s !== '..' && s !== '.DS_Store').length === 0) {
    throw new Error(`Failed to find any migration definitions in migrations directory: '${migrationFolder}'`)
  }

  const migrate = await import("@schemavaults/dbh/migrate").then(mod => mod.migrate);
  const result = await migrate({
    db: db,
    migrationFolder,
    version: undefined // use latest
  })
  return result;
}

if (require.main === module) {
  const runAsScript = async (): Promise<void> => {
    await using dbh = ServerlessDatabase.createDBH();
    const result = await migrateToLatest(dbh.db);
    console.log("Migration Result(s): ", result)
  }
  runAsScript();
}
