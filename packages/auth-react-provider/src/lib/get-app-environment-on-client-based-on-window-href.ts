"use client";

import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";

export function getAppEnvironmentOnClientBasedOnWindowHref(
  window: Window,
): SchemaVaultsAppEnvironment | undefined {
  if (!window) {
    throw new Error(
      "'window' is not defined! Is this code running server-side?",
    );
  }

  const href: string | undefined = window.location.href ?? undefined;
  if (href) {
    if (
      href === "https://schemavaults.com" ||
      href.startsWith("https://schemavaults.com/")
    ) {
      return "production";
    } else if (
      href === "https://auth.schemavaults.com" ||
      href.startsWith("https://auth.schemavaults.com/")
    ) {
      return "production";
    } else if (
      href === "https://staging.schemavaults.com" ||
      href.startsWith("https://staging.schemavaults.com/")
    ) {
      return "staging";
    } else if (
      href === "https://auth-staging.schemavaults.com" ||
      href.startsWith("https://auth-staging.schemavaults.com/")
    ) {
      return "staging";
    }
  }

  return undefined;
}

export default getAppEnvironmentOnClientBasedOnWindowHref;
