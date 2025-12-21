"use client";

import {
  getAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { useContext } from "react";
import SchemaVaultsAppEnvironmentContext from "@/contexts/app-environment-context";
import getAppEnvironmentOnClientBasedOnWindowHref from "@/lib/get-app-environment-on-client-based-on-window-href";
import isClientRuntime from "@/lib/isClientRuntime";

const DEBUG = false as const satisfies boolean;

export function useAppEnvironment(): SchemaVaultsAppEnvironment {
  const contextValue: SchemaVaultsAppEnvironment | null = useContext(
    SchemaVaultsAppEnvironmentContext,
  );
  let appEnv: SchemaVaultsAppEnvironment | undefined = undefined;

  let runtime: "client" | "server" | undefined = undefined;
  if (isClientRuntime()) {
    runtime = "client";
  } else {
    runtime = "server";
  }

  if (!runtime) {
    throw new Error(
      "Failed to determine if this runtime environment is 'client' or 'server'!",
    );
  }

  // Attempt to resolve app environment from current URL
  // (e.g. we know that if on https://schemavaults.com it's going to be production)
  if (runtime === "client") {
    try {
      // Catch so hook could still run on SSR
      appEnv = getAppEnvironmentOnClientBasedOnWindowHref(window);
    } catch (e: unknown) {
      console.error(
        "[useAppEnvironment] Failed to resolve app environment on client: ",
        e,
      );
      throw new Error(
        "Error attempting to resolve app environment on client based on window href!",
      );
    }
    if (appEnv) {
      if (DEBUG) {
        console.log(
          "[useAppEnvironment] Loaded current environment based on current URL: ",
          appEnv,
        );
      }
      return appEnv;
    }
  }

  // Attempt to resolve app environment from env. vars. on server-side
  if (runtime === "server") {
    try {
      const parsed =
        schemaVaultsAppEnvironmentSchema.safeParse(getAppEnvironment());
      if (!parsed.success) {
        console.error(
          "Loaded invalid app environment from 'getAppEnvironment' on server-side: ",
          parsed.error,
        );
        throw new TypeError(
          "Received invalid app environment from 'getAppEnvironment' on server-side!",
        );
      }
      appEnv = parsed.data;
      if (DEBUG) {
        console.log(
          "[useAppEnvironment] Loaded current environment based on server-side environment variables: ",
          appEnv,
        );
      }
      return appEnv satisfies SchemaVaultsAppEnvironment;
    } catch (e: unknown) {
      console.error(
        "Failed to resolve app environment from environment variables on server-side: ",
        e,
      );
      throw new Error(
        "Failed to resolve app environment from environment variables on server-side!",
      );
    }
  }

  // Falling back to checking React context for environment
  if (runtime !== "client") {
    throw new Error(
      "Expected app environment to have been resolved by this point for non-client environments.",
    );
  }

  if (!contextValue || typeof contextValue !== "string") {
    throw new Error(
      "useAppEnvironment must be used within a SchemaVaultsAppEnvironmentContextProvider!",
    );
  }
  if (!schemaVaultsAppEnvironmentSchema.safeParse(contextValue).success) {
    throw new TypeError(
      "Received invalid app environment from SchemaVaultsAppEnvironmentContext!",
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
