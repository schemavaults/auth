import {
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
} from "@/app-environments";

function stripQuotes(maybeQuotes?: string | undefined): string | undefined {
  if (!maybeQuotes) return maybeQuotes;
  const trimmed = maybeQuotes.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export default function parseAppEnvironmentFromProcessDotEnv(
  DEBUG_GET_APP_ENVIRONMENT: boolean = false,
): SchemaVaultsAppEnvironment {
  const dynamicProcessDotEnvAppEnv = process.env.SCHEMAVAULTS_APP_ENVIRONMENT;
  const inlinedNextJsAppEnv =
    process.env.NEXT_PUBLIC_SCHEMAVAULTS_APP_ENVIRONMENT;

  // dynamic should take priority over NEXT_PUBLIC_ , as one is inlined
  // (e.g. in docker build it will always be "production", even if trying to run container as test/development)

  if (typeof dynamicProcessDotEnvAppEnv === "string") {
    const parsed = schemaVaultsAppEnvironmentSchema.safeParse(
      stripQuotes(dynamicProcessDotEnvAppEnv),
    );
    if (parsed.success) {
      if (DEBUG_GET_APP_ENVIRONMENT) {
        console.log(
          "[getAppEnvironment] Using SCHEMAVAULTS_APP_ENVIRONMENT environment variable: ",
          parsed.data,
        );
      }
      return parsed.data;
    }
    throw new Error(
      "Environment variable SCHEMAVAULTS_APP_ENVIRONMENT is defined but invalid!",
    );
  } else {
    if (DEBUG_GET_APP_ENVIRONMENT) {
      console.log(
        "[getAppEnvironment] Environment variable SCHEMAVAULTS_APP_ENVIRONMENT is not defined",
      );
    }
  }

  if (typeof inlinedNextJsAppEnv === "string") {
    const parsed = schemaVaultsAppEnvironmentSchema.safeParse(
      stripQuotes(inlinedNextJsAppEnv),
    );
    if (parsed.success) {
      if (DEBUG_GET_APP_ENVIRONMENT) {
        console.log(
          "[getAppEnvironment] Using NEXT_PUBLIC_SCHEMAVAULTS_APP_ENVIRONMENT environment variable: ",
          parsed.data,
        );
      }
      return parsed.data;
    }
    throw new Error(
      "Environment variable NEXT_PUBLIC_SCHEMAVAULTS_APP_ENVIRONMENT is defined but invalid!",
    );
  } else {
    if (DEBUG_GET_APP_ENVIRONMENT) {
      console.log(
        "[getAppEnvironment] Environment variable NEXT_PUBLIC_SCHEMAVAULTS_APP_ENVIRONMENT is not defined",
      );
    }
  }

  // Show this warning in all environments
  if (DEBUG_GET_APP_ENVIRONMENT) {
    console.warn(
      "SCHEMAVAULTS_APP_ENVIRONMENT and NEXT_PUBLIC_SCHEMAVAULTS_APP_ENVIRONMENT are not defined!" +
        " Falling back to examining NODE_ENV...",
    );
  }

  const node_env: string | undefined = process.env.NODE_ENV;
  if (
    node_env !== "development" &&
    node_env !== "test" &&
    node_env !== "production"
  ) {
    throw new TypeError(
      "Expected NODE_ENV to be one of: 'development', 'test', or 'production'",
    );
  }

  if (node_env === "development") {
    if (DEBUG_GET_APP_ENVIRONMENT) {
      console.log(
        "[getAppEnvironment] Running in 'development' environment based on NODE_ENV",
      );
    }
    return "development";
  }
  if (node_env === "test") {
    if (DEBUG_GET_APP_ENVIRONMENT) {
      console.log(
        "[getAppEnvironment] Running in 'test' environment based on NODE_ENV",
      );
    }
    return "test";
  }

  if (node_env !== "production") {
    throw new Error(
      "Expected NODE_ENV to be 'production' if this point is reached!",
    );
  }

  throw new Error(
    "NODE_ENV is set to 'production', but SCHEMAVAULTS_APP_ENVIRONMENT environment variable is not defined!",
  );
}
