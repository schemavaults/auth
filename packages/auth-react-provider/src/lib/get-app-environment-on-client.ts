"use client";

import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";

export function getAppEnvironmentOnClient(
  window: Window,
): SchemaVaultsAppEnvironment {
  if (!window) {
    throw new Error(
      "'window' is not defined! Is this code running server-side?",
    );
  }

  const href: string | undefined = window.location.href ?? undefined;
  if (href) {
    if (href.includes("https://schemavaults.com")) {
      return "production";
    } else if (href.includes("https://auth.schemavaults.com")) {
      return "production";
    } else if (href.includes("http://localhost")) {
      return "development";
    } else if (href.includes("https://staging.schemavaults.com")) {
      return "staging";
    } else if (href.includes("https://auth-staging.schemavaults.com")) {
      return "staging";
    }
  }

  try {
    return getAppEnvironment();
  } catch (e: unknown) {
    void e; /** no-op */
  }

  throw new Error(
    "Failed to determine app environment for SchemaVaults app client!",
  );
}
