import {
  schemaVaultsAppEnvironmentSchema,
  type SchemaVaultsAppEnvironment,
} from "./app-environments";

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

function parseSchemaVaultsAppEnvironmentFromProcessDotEnv(): SchemaVaultsAppEnvironment {
  if (typeof process.env.SCHEMAVAULTS_APP_ENVIRONMENT !== "string") {
    throw new Error(
      "SchemaVaults App Environment configuration could not be resolved from environment variables! Is 'SCHEMAVAULTS_APP_ENVIRONMENT' set?",
    );
  }
  const parsed = schemaVaultsAppEnvironmentSchema.safeParse(
    process.env.SCHEMAVAULTS_APP_ENVIRONMENT,
  )
  if (!parsed.success) {
    throw new Error(
      "process.env.SCHEMAVAULTS_APP_ENVIRONMENT is not set to a valid variable!",
    );
  }
  return parsed.data satisfies SchemaVaultsAppEnvironment;
}

export function getAppEnvironment(
  DEBUG_GET_APP_ENVIRONMENT: boolean = false,
): SchemaVaultsAppEnvironment {
  // Ensure that getAppEnvironment is only used server-side or from non-React/browser applications

  let isBrowser: boolean = false;
  try {
    // @ts-expect-error We're checking if the 'window' global is defined when DOM library is not explicitly loaded
    if (window) {
      isBrowser = true;
    }
  } catch (e: unknown) {
    void e; // no-op-- it's okay for this to not be a browser
    isBrowser = false;
  }


  if (isBrowser) {
    if (typeof process !== "undefined" && !!process) {
      if (typeof typeof process.env.NODE_ENV === "string") {
        switch (process.env.NODE_ENV) {
          case "development":
            return "development";
          case "test":
            return "test";
          case "production":
            return parseSchemaVaultsAppEnvironmentFromProcessDotEnv();
          default:
        }
      }
    }

    throw new Error(
      "Invalid usage of getAppEnvironment in a browser context! Please try useAppEnvironment instead...",
    );
  } else {
    if (DEBUG_GET_APP_ENVIRONMENT) {
      console.log(
        "[getAppEnvironment] This does not appear to be within browser context! (window = undefined!)",
      );
    }
  }

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
        " Falling back to examining NODE_ENV and HOST/HOSTNAME/NEXT_PUBLIC_HOSTNAME...",
    );
  }

  const node_env = process.env.NODE_ENV;
  if (DEBUG_GET_APP_ENVIRONMENT) {
    console.log(
      "[getAppEnvironment] Running in NODE_ENV environment: ",
      node_env,
    );
  }

  if (node_env === "production") {
    // staging environment also has NODE_ENV === 'production'

    let isStagingEnv: boolean = false;

    const host: string | undefined =
      process.env.HOST ??
      process.env.HOSTNAME ??
      process.env.NEXT_PUBLIC_HOSTNAME;
    if (typeof host === "string") {
      if (host.includes("staging")) {
        isStagingEnv = true;
      }
    }

    if (isStagingEnv) {
      return "staging";
    }

    return "production";
  }
  if (node_env === "development") {
    return "development";
  }
  if (node_env === "test") {
    return "test";
  }
  throw new Error("Failed to determine the current app environment!");
}
