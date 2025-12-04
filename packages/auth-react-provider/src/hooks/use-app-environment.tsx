"use client";

import {
  getAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { useContext } from "react";
import { SchemaVaultsAppEnvironmentContext } from "@/contexts/app-environment-context";
import { getAppEnvironmentOnClient } from "@/lib/get-app-environment-on-client";

const DEBUG = false as const satisfies boolean;

export function useAppEnvironment(): SchemaVaultsAppEnvironment {
  const contextValue: SchemaVaultsAppEnvironment | null = useContext(
    SchemaVaultsAppEnvironmentContext,
  );
  let appEnv: SchemaVaultsAppEnvironment | undefined = undefined;

  try {
    // Catch so hook could still run on SSR
    appEnv = getAppEnvironmentOnClient(window);
  } catch (e: unknown) {
    void e; /** no-op, window might not be defined on server */
  }

  if (appEnv && DEBUG) {
    console.log(
      "[useAppEnvironment] Loaded current environment based on current URL: ",
      appEnv,
    );
  }
  if (appEnv) return appEnv;

  try {
    const serverSideAppEnv = getAppEnvironment();
    if (schemaVaultsAppEnvironmentSchema.safeParse(serverSideAppEnv).success) {
      return serverSideAppEnv;
    }
  } catch (e: unknown) {
    void e; /** no-op, this should throw/catch on client-side for getAppEnvironment usage */
  }

  if (appEnv && DEBUG) {
    console.log(
      "[useAppEnvironment] Loaded current environment based on server-side env vars: ",
      appEnv,
    );
  }
  if (appEnv) {
    return appEnv;
  }

  if (!contextValue || typeof contextValue !== "string") {
    throw new Error(
      "useAppEnvironment must be used within a SchemaVaultsAppEnvironmentContextProvider!",
    );
  }
  appEnv = contextValue;

  if (DEBUG) {
    console.log(
      `[useAppEnvironment] Loaded app environment context: "${appEnv}"`,
    );
  }
  return appEnv;
}

export default useAppEnvironment;

export type { SchemaVaultsAppEnvironment };
