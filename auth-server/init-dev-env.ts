// init-dev-env.ts
// Initializes auth-server/.env.development with all required development environment variables

import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, normalize } from "path";
import { postgresCredentialEnvironmentVariables } from "../auth-postgres-db/add-dev-db-credentials-to-auth-server-env";
import { cwd } from "process";
import { randomBytes } from "crypto";

const thisScriptName = "init-dev-env.ts";

function resolveMonorepoRoot(): string {
  if (existsSync(join(cwd(), thisScriptName))) {
    return normalize(join(cwd(), ".."));
  } else if (existsSync(join(cwd(), "auth-server"))) {
    return cwd();
  } else {
    console.error("Failed to resolve monorepo root!");
    process.exit(1);
  }
}

function resolveAuthServerDir(): string {
  const monorepoRoot: string = resolveMonorepoRoot();
  const authServerDir = join(monorepoRoot, "auth-server");
  if (existsSync(authServerDir)) {
    return authServerDir;
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
  passwordSalt: string,
  passwordHashRounds: number,
  mfaSecretKek: string,
  mfaRecoveryPepper: string,
): string {
  const lines: string[] = [];

  lines.push(`# Development Environment Variables (added by ${thisScriptName})`);
  lines.push(`NODE_ENV="development"`);
  lines.push(`SCHEMAVAULTS_APP_ENVIRONMENT="development"`);
  lines.push(`NEXT_PUBLIC_SCHEMAVAULTS_APP_ENVIRONMENT="development"`);
  // Must match the auth server's own app id (SCHEMAVAULTS_AUTH_SERVER_APP_ID,
  // default "schemavaults-auth"); dev uses the default white-label config.
  lines.push(`SCHEMAVAULTS_API_SERVER_ID="schemavaults-auth"`);
  lines.push("");

  lines.push(`# Password Hashing`);
  lines.push(`PRIVATE_GLOBAL_PASSWORD_SALT="${passwordSalt}"`);
  lines.push(`PRIVATE_PASSWORD_HASH_ROUNDS=${passwordHashRounds}`);
  lines.push("");

  lines.push(`# Multi-Factor Authentication (TOTP)`);
  lines.push(`PRIVATE_MFA_SECRET_KEK="${mfaSecretKek}"`);
  lines.push(`PRIVATE_MFA_RECOVERY_PEPPER="${mfaRecoveryPepper}"`);
  lines.push("");

  if (superuserInviteCode) {
    lines.push(`# Superuser Invite Code`);
    lines.push(`PRIVATE_SUPERUSER_INVITE_CODE="${superuserInviteCode}"`);
    lines.push("");
  }

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

  const passwordSalt = promptWithDefault(
    "Enter PRIVATE_GLOBAL_PASSWORD_SALT",
    "blahblahblah",
  );

  const passwordHashRoundsInput = promptWithDefault(
    "Enter PRIVATE_PASSWORD_HASH_ROUNDS",
    "3",
  );
  const passwordHashRounds = parseInt(passwordHashRoundsInput, 10);
  if (isNaN(passwordHashRounds) || passwordHashRounds < 1) {
    console.error("Error: PRIVATE_PASSWORD_HASH_ROUNDS must be a positive integer.");
    process.exit(1);
  }

  // The MFA KEK and recovery pepper are private secrets that don't have
  // useful default values in development; auto-generate fresh 32-byte
  // base64 strings on each first run, but accept overrides if a developer
  // pastes existing values.
  const mfaSecretKek = promptWithDefault(
    "Enter PRIVATE_MFA_SECRET_KEK (32-byte base64; leave blank to auto-generate)",
    randomBytes(32).toString("base64"),
  );
  const mfaRecoveryPepper = promptWithDefault(
    "Enter PRIVATE_MFA_RECOVERY_PEPPER (32-byte base64; leave blank to auto-generate)",
    randomBytes(32).toString("base64"),
  );

  const envContent = generateEnvContent(
    superuserInviteCode,
    passwordSalt,
    passwordHashRounds,
    mfaSecretKek,
    mfaRecoveryPepper,
  );

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
