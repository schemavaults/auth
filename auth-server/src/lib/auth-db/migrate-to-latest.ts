import "server-only";
import { join } from "path";
import type { Kysely } from "@schemavaults/dbh";
import { existsSync, readdirSync } from "fs";
import ServerlessDatabase from "./serverless-database";

export default async function migrateToLatest(db: Kysely<any>): Promise<void> {
  const migrationFolder = join(__dirname, "migrations")

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
