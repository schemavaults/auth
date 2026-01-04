import { type SchemaVaultsAppEnvironment } from "@/app-environments";
import isBrowserRuntime from "./isBrowserRuntime";
import parseAppEnvironmentFromProcessDotEnv from "./parse-app-environment-from-processDotEnv";

export function getAppEnvironment(
  DEBUG_GET_APP_ENVIRONMENT: boolean = false,
): SchemaVaultsAppEnvironment {
  const isBrowser: boolean = isBrowserRuntime();

  if (isBrowser) {
    throw new Error(
      "Invalid usage of getAppEnvironment() in a browser context!",
    );
  }

  return parseAppEnvironmentFromProcessDotEnv(DEBUG_GET_APP_ENVIRONMENT);
}

export default getAppEnvironment;
