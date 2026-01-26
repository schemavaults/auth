// build-db-migrations.ts

import { existsSync, readdirSync, rmSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { type BunPlugin } from "bun";

const debug: boolean = process.env.NODE_ENV === 'development';

const SCRIPT_DIR = process.cwd();
const MIGRATIONS_SRC = join(SCRIPT_DIR, "src/lib/auth-db/migrations");
const RAW_SQL_MODULE_SRC = join(SCRIPT_DIR, "src/lib/auth-db/sql.ts")
const RAW_SQL_MODULE_DIST = join(SCRIPT_DIR, "dist/sql.js");
const MIGRATIONS_DIST = join(SCRIPT_DIR, "dist/migrations");

// Verify we're in the auth-server directory
if (basename(SCRIPT_DIR) !== "auth-server") {
  console.error("Error: This script must be located in the auth-server directory");
  process.exit(1);
}

if (!existsSync(join(SCRIPT_DIR, "package.json"))) {
  console.error(`Error: package.json not found in ${SCRIPT_DIR}`);
  process.exit(1);
}

if (!existsSync(MIGRATIONS_SRC)) {
  console.error(`Error: Migrations source directory not found: ${MIGRATIONS_SRC}`);
  process.exit(1);
}

if (!existsSync(RAW_SQL_MODULE_SRC)) {
  console.error(`Error: sql.ts source module not found: ${RAW_SQL_MODULE_SRC}`);
  process.exit(1);
}

// Clear and create dist/migrations directory
if (existsSync(MIGRATIONS_DIST)) {
  rmSync(MIGRATIONS_DIST, { recursive: true });
}
mkdirSync(MIGRATIONS_DIST, { recursive: true });

if (existsSync(RAW_SQL_MODULE_DIST)) {
  rmSync(RAW_SQL_MODULE_DIST);
}

// Get all .ts migration files
const migrationFiles = readdirSync(MIGRATIONS_SRC)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => join(MIGRATIONS_SRC, file));

if (migrationFiles.length === 0) {
  console.error("Error: No .ts migration files found");
  process.exit(1);
}

// Marker used for sql imports - will be replaced in post-processing
const SQL_IMPORT_MARKER = "__sql_external__";

const buildDbMigrationsSqlImportRewriterPlugin: BunPlugin = {
  name: "db-migrations-sql-import-rewriter",
  setup(build) {
    // Rewrite @/sql to a marker that will be kept external and post-processed
    build.onLoad({ filter: /\.(ts|tsx|js|jsx)$/ }, async (args) => {
      const text = await Bun.file(args.path).text();

      const modifiedText = text
        .replace(
          /import\s+{([^}]+)}\s+from\s+['"]@\/sql['"]/g,
          `import {$1} from "${SQL_IMPORT_MARKER}"`
        )
        .replace(
          /import\s+sql\s+from\s+['"]@\/sql['"]/g,
          `import { sql } from "${SQL_IMPORT_MARKER}"`
        )

      if (debug && text !== modifiedText) {
        console.log(`[db-migrations-sql-import-rewriter] onLoad(${args.path})`);
      }

      return {
        contents: modifiedText,
        loader: "ts",
      };
    });
  },
}

// Build migrations into .js files
async function buildMigrations() {
  const result = await Bun.build({
    entrypoints: [...migrationFiles],
    outdir: MIGRATIONS_DIST,
    target: "node",
    sourcemap: "none",
    plugins: [
      buildDbMigrationsSqlImportRewriterPlugin
    ],
    external: [
      SQL_IMPORT_MARKER,
      "@schemavaults/dbh",
      "kysely"
    ]
  });

  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  return result;
}

// Post-process migration outputs to replace the marker with the actual import path
// This is needed because Bun's bundler doesn't support rewriting external import specifiers
async function postProcessMigrations(outputs: Bun.BuildArtifact[]) {
  const targetImport = "../sql.js";

  for (const output of outputs) {
    const content = await Bun.file(output.path).text();

    if (content.includes(SQL_IMPORT_MARKER)) {
      const rewrittenContent = content.replace(
        new RegExp(`from\\s+["']${SQL_IMPORT_MARKER}["']`, 'g'),
        `from "${targetImport}"`
      );
      await Bun.write(output.path, rewrittenContent);

      if (debug) {
        console.log(`[post-process] Rewrote ${SQL_IMPORT_MARKER} => ${targetImport} in ${basename(output.path)}`);
      }
    }
  }
}

async function buildSqlModule() {
  const result = await Bun.build({
    entrypoints: [RAW_SQL_MODULE_SRC],
    outdir: join(SCRIPT_DIR, "dist"),
    target: "node",
    sourcemap: "none",
  });

  if (!result.success) {
    console.error("Build failed:");
    for (const log of result.logs) {
      console.error(log);
    }
    process.exit(1);
  }

  if (!existsSync(RAW_SQL_MODULE_DIST)) {
    console.error("Expected sql.js to exist after build operation!")
    process.exit(1);
  }

  return result;
}

async function build() {
  const results = await Promise.all([
    buildMigrations(),
    buildSqlModule()
  ]);

  // Post-process migration outputs to rewrite the sql import marker
  await postProcessMigrations(results[0].outputs);

  function printMigrationsList() {
    console.log("");
    console.log("Built migrations:");
    for (const migration of results[0].outputs) {
      console.log(`  - ${basename(migration.path)} (${migration.size} bytes)`);
    }

    console.log("");
    console.log(`Total: ${results[0].outputs.length} migration(s) built`);
  }

  printMigrationsList();

  if (results[1].outputs.length !== 1 && results[1].outputs[0]) {
    console.error("Expected there to be exactly one output from sql.js module write!")
  }
  console.log(`Wrote supporting sql.js module to: ${results[1].outputs[0]!.path} (${results[1].outputs[0]!.size} bytes)`)

  return results;
}

build()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
