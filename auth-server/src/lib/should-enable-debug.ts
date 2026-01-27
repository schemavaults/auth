import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export function shouldEnableDebug(
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
) {
  if (
    environment === "development" ||
    environment === "test" ||
    environment === "staging"
  ) {
    return true;
  }

  return false;
}

export default shouldEnableDebug;
