import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import isClientRuntime from "./isClientRuntime";

/**
 * @description Throws if https: is not used for window.location.protocol in client runtime
 * @param appEnvironment The current environment
 * @returns void
 */
export default function assertHttpsInProduction(
  appEnvironment: SchemaVaultsAppEnvironment,
): void {
  if (!isClientRuntime()) {
    return;
  }
  if (appEnvironment === "production" || appEnvironment === "staging") {
    if (
      typeof window !== "undefined" &&
      window.location.protocol !== "https:"
    ) {
      throw new Error(
        `Insecure context: HTTPS is required in production or staging environments.` +
          ` Current environment: ${appEnvironment}`,
      );
    }
  }
}
