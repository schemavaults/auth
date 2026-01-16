// init-dev-env.ts
// Initializes auth-server/.env.development with all required development environment variables

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { postgresCredentialEnvironmentVariables } from "../auth-postgres-db/add-dev-db-credentials-to-auth-server-env";

const thisScriptName = "init-dev-env.ts";

function resolveAuthServerDir(): string {
  const scriptDir = import.meta.dir;
  if (existsSync(join(scriptDir, "package.json"))) {
    return scriptDir;
  }
  console.error("Failed to resolve auth-server/ directory!");
  process.exit(1);
}

function resolveAuthServerDevelopmentEnvVarsFile(): string {
  return join(resolveAuthServerDir(), ".env.development");
}

function promptWithDefault(message: string, defaultValue: string): string {
  const input = prompt(`${message} [${defaultValue}]:`);
  if (input === null || input.trim() === "") {
    return defaultValue;
  }
  return input.trim();
}

function generateEnvContent(
  superuserInviteCode: string,
  privateBeta: string,
): string {
  const lines: string[] = [];

  lines.push(`# Development Environment Variables (added by ${thisScriptName})`);
  lines.push(`NODE_ENV="development"`);
  lines.push(`SCHEMAVAULTS_APP_ENVIRONMENT="development"`);
  lines.push(`NEXT_PUBLIC_SCHEMAVAULTS_APP_ENVIRONMENT="development"`);
  lines.push("");

  lines.push(`# Superuser Invite Code`);
  lines.push(`PRIVATE_SUPERUSER_INVITE_CODE="${superuserInviteCode}"`);
  lines.push("");

  lines.push(`# Private Beta Flag`);
  lines.push(`NEXT_PUBLIC_SCHEMAVAULTS_PRIVATE_BETA="${privateBeta}"`);
  lines.push("");

  // Add postgres credentials from the existing script
  lines.push(postgresCredentialEnvironmentVariables());

  return lines.join("\n");
}

async function main(): Promise<void> {
  const devEnvFile = resolveAuthServerDevelopmentEnvVarsFile();

  if (existsSync(devEnvFile)) {
    const existingContent = readFileSync(devEnvFile, { encoding: "utf-8" });
    if (existingContent.trim().length > 0) {
      console.error(
        `Error: ${devEnvFile} already exists and is not empty.`,
      );
      console.error(
        "Please delete or rename the existing file before running this script.",
      );
      process.exit(1);
    }
  }

  console.log("=== Auth Server Development Environment Initialization ===\n");

  const superuserInviteCode = promptWithDefault(
    "Enter PRIVATE_SUPERUSER_INVITE_CODE",
    "superuser",
  );

  const privateBeta = promptWithDefault(
    "Enter NEXT_PUBLIC_SCHEMAVAULTS_PRIVATE_BETA (true/false)",
    "true",
  );

  const envContent = generateEnvContent(superuserInviteCode, privateBeta);

  writeFileSync(devEnvFile, envContent, { encoding: "utf-8" });

  console.log(`\nSuccessfully wrote development environment to: ${devEnvFile}`);
  console.log("\nGenerated configuration:");
  console.log("─".repeat(50));
  console.log(envContent);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
