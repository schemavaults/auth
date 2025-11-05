"use client";

import type { SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import useDebug from "@/hooks/use-debug";
import useAppEnvironment from "@/hooks/use-app-environment";

export function useIsClientExecutionEnvironment(): boolean {
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const debug: boolean = useDebug(environment);

  try {
    if (!!window) {
      return true;
    }
  } catch (e: unknown) {}

  if (debug) {
    console.log(
      "[useIsClientExecutionEnvironment] This does not appear to be running in the browser!",
    );
  }

  return false;
}

export default useIsClientExecutionEnvironment;
