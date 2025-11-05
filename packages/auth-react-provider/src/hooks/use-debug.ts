"use client";

import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { useMemo } from "react";

export function useDebug(environment: SchemaVaultsAppEnvironment): boolean {
  return useMemo((): boolean => {
    if (
      environment === "development" ||
      environment === "test" ||
      environment === "staging"
    ) {
      return true;
    }

    try {
      if (
        typeof process.env.NEXT_PUBLIC_SCHEMAVAULTS_PRIVATE_BETA === "string" &&
        process.env.NEXT_PUBLIC_SCHEMAVAULTS_PRIVATE_BETA.includes("true")
      ) {
        return true;
      }
    } catch (e: unknown) {
      /** no-op */
    }

    return false;
  }, [environment]);
}

export default useDebug;

export function useDebugWithSpecifiedBooleanOrLookupDefault(
  environment: SchemaVaultsAppEnvironment,
  debug?: undefined | boolean,
): boolean {
  const defaultDebugState: boolean = useDebug(environment);
  if (typeof debug === "boolean") {
    return debug;
  } else {
    return defaultDebugState;
  }
}
