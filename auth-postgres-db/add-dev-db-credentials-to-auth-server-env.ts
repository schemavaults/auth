// add-dev-db-credentials-to-auth-server-env.ts
const thisScriptName = "add-dev-db-credentials-to-auth-server-env.ts";

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join, normalize } from "path";
import { cwd } from "process";

const POSTGRES_USER = "schemavaults-auth-server-dev";
const POSTGRES_PASSWORD = "schemavaults-auth-server-dev";
const POSTGRES_DATABASE = "schemavaults-auth-server-dev";
const POSTGRES_PORT = 5432;
const POSTGRES_HOST = "localhost";

const POSTGRES_URL = `postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DATABASE}`;
const POSTGRES_URL_NO_SSL = POSTGRES_URL;
const POSTGRES_URL_NON_POOLING = POSTGRES_URL;

export function postgresCredentialEnvironmentVariables(): string {
  const envLines: string[] = [];
  envLines.push(
    // Comment explaining this .env section
    `# Postgres Credentials for Development DB (added by ${thisScriptName})`,
  );
  envLines.push(`POSTGRES_USER="${POSTGRES_USER}"`);
  envLines.push(`POSTGRES_PASSWORD="${POSTGRES_PASSWORD}"`);
  envLines.push(`POSTGRES_DATABASE="${POSTGRES_DATABASE}"`);
  envLines.push(`POSTGRES_PORT=${POSTGRES_PORT}`);
  envLines.push(`POSTGRES_HOST="${POSTGRES_HOST}"`);
  envLines.push(`POSTGRES_URL="${POSTGRES_URL}"`);
  envLines.push(`POSTGRES_URL_NO_SSL="${POSTGRES_URL_NO_SSL}"`);
  envLines.push(`POSTGRES_URL_NON_POOLING="${POSTGRES_URL_NON_POOLING}"`);
  return `${envLines.join("\n")}\n`;
}

function resolveMonorepoRoot(): string {
  if (existsSync(join(cwd(), thisScriptName))) {
    return normalize(join(cwd(), ".."));
  } else if (existsSync(join(cwd(), "auth-postgres-db"))) {
    return cwd();
  } else {
    console.error("Failed to resolve monorepo root!");
    process.exit(1);
  }
}

function resolveAuthServerDir(): string {
  const p = join(resolveMonorepoRoot(), "auth-server");
  if (!existsSync(p)) {
    console.error("Failed to resolve auth-server/ directory!");
    process.exit(1);
  }
  return p;
}

function resolveAuthServerDevelopmentEnvVarsFile(): string {
  return join(resolveAuthServerDir(), ".env.development");
}

function performDevEnvironmentAppend(): void {
  const devEnvFile: string = resolveAuthServerDevelopmentEnvVarsFile();
  const newEnvLines: string = postgresCredentialEnvironmentVariables();
  if (existsSync(devEnvFile)) {
    const existingEnvFile: string = readFileSync(devEnvFile, {
      encoding: "utf-8",
    });
    if (existingEnvFile.includes("POSTGRES_")) {
      console.error(
        "Existing .env.development file appears to already contain Postgres credentials! (contains the string 'POSTGRES_')",
      );
      process.exit(1);
    }
    appendFileSync(devEnvFile, newEnvLines, { encoding: "utf-8" });
    console.log(
      `Appended the following to file '${devEnvFile}':\n${newEnvLines}`,
    );
    return;
  } else {
    writeFileSync(devEnvFile, newEnvLines, { encoding: "utf-8" });
    console.log(`Wrote the following to file '${devEnvFile}':\n${newEnvLines}`);
    return;
  }
}

if (require.main === module) {
  performDevEnvironmentAppend();
  process.exit(0);
}
