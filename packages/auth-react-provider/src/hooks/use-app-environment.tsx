"use client";

import {
  schemaVaultsAppEnvironmentSchema,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { useContext } from "react";
import SchemaVaultsAppEnvironmentContext from "@/contexts/app-environment-context";
import isClientRuntime from "@/lib/isClientRuntime";
import getAppEnvironment from "@schemavaults/app-definitions/get-app-environment";

const DEBUG = false as const satisfies boolean;

function resolveAppEnvironmentOnServer(): SchemaVaultsAppEnvironment {
  if (!process) {
    throw new Error(
      "Failed to resolve 'process' to access environment variables from!",
    );
  }
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
    return parsed.data;
  } catch (e: unknown) {
    if (e instanceof TypeError) {
      throw e;
    }
    console.error(
      "Failed to resolve app environment from environment variables on server-side: ",
      e,
    );
    throw new Error(
      "Failed to resolve app environment from environment variables!",
    );
  }
}

export function useAppEnvironment(): SchemaVaultsAppEnvironment {
  const contextValue: SchemaVaultsAppEnvironment | null = useContext(
    SchemaVaultsAppEnvironmentContext,
  );

  const runtime: "client" | "server" = isClientRuntime() ? "client" : "server";
  if (!runtime) {
    throw new Error(
      "Failed to determine if this runtime environment is 'client' or 'server'!",
    );
  }

  // Attempt to resolve app environment from env. vars. on server-side
  if (runtime === "server") {
    if (window) {
      throw new Error("Server-side code running on the client!");
    }
    return resolveAppEnvironmentOnServer();
  }
  // On the client, we should have access to the app environment context
  else if (runtime === "client") {
    if (!window) {
      throw new Error("Client-side code running on the server!");
    }
    return (function resolveAndParseAppEnvironmentContextOnReactClient(): SchemaVaultsAppEnvironment {
      if (!contextValue || typeof contextValue !== "string") {
        throw new Error(
          "useAppEnvironment must be used within a SchemaVaultsAppEnvironmentContextProvider!",
        );
      }
      const parsed = schemaVaultsAppEnvironmentSchema.safeParse(contextValue);
      if (!parsed.success) {
        throw new TypeError(
          "Received invalid app environment from SchemaVaultsAppEnvironmentContext!",
        );
      }
      if (DEBUG) {
        console.log(
          `[useAppEnvironment] Loaded app environment context: "${parsed.data}"`,
        );
      }
      return parsed.data;
    })() satisfies SchemaVaultsAppEnvironment;
  } else {
    throw new TypeError(
      "Invalid value for variable 'runtime'. Failed to determine if this is client or server?",
    );
  }
}

export default useAppEnvironment;

export type { SchemaVaultsAppEnvironment };
