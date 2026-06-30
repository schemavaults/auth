import type { SchemaVaultsAppEnvironment } from "./app-environments";
import { getAppEnvironment } from "./get-app-environment";
import { z } from "zod";

const urlSchema = z.string().url();

class AuthServerUrlNotSetConfigError extends Error {}

const ENV_KEY = "SCHEMAVAULTS_AUTH_SERVER_URL" as const;

function parseAuthServerUrl(): string {
  const envVarFlag: string | undefined = process.env[ENV_KEY];
  if (typeof envVarFlag === "undefined") {
    throw new AuthServerUrlNotSetConfigError(
      `No environment variable found with key "${ENV_KEY}"`,
    );
  }

  const parsedEnvVar = urlSchema.safeParse(envVarFlag);
  if (!parsedEnvVar.success) {
    throw new Error(
      "Failed to load 'SCHEMAVAULTS_AUTH_SERVER_URL' from environment variables!",
      {
        cause: parsedEnvVar.error,
      },
    );
  }
  return parsedEnvVar.data;
}

function getDefaultAuthServerUrl(environment: SchemaVaultsAppEnvironment) {
  switch (environment) {
    case "production":
      return "https://auth.schemavaults.com";
    case "staging":
      return "https://auth-staging";
    case "test":
      return "http://schemavaults-auth";
    case "development":
      return "http://localhost:6767";
    default:
      throw new Error("No default auth server URL set for environment", {
        cause: `Environment: ${environment}`,
      });
  }
}

export function getAuthServerUrl(
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
): string {
  let auth_server_url: string;
  try {
    auth_server_url = parseAuthServerUrl();
  } catch (e: unknown) {
    if (e instanceof AuthServerUrlNotSetConfigError) {
      auth_server_url = getDefaultAuthServerUrl(environment);
    } else {
      throw e;
    }
  }

  if (environment === "production" || environment === "staging") {
    if (!auth_server_url.startsWith("https://")) {
      throw new TypeError(
        "Auth server URL must use HTTPS in production or staging environments!",
        {
          cause: auth_server_url,
        },
      );
    }
  }

  return auth_server_url;
}

export default getAuthServerUrl;
