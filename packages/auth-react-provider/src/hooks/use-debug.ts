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
