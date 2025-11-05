import {
  getAppEnvironment,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { isPrivateBetaEnabled } from "./private-beta";

export function shouldEnableDebug(
  environment: SchemaVaultsAppEnvironment = getAppEnvironment(),
  private_beta: boolean = isPrivateBetaEnabled(),
) {
  if (
    environment === "development" ||
    environment === "test" ||
    environment === "staging"
  ) {
    return true;
  }
  if (private_beta) {
    return true;
  }

  return false;
}

export default shouldEnableDebug;
