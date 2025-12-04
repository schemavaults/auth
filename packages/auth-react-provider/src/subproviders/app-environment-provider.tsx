"use client";

import {
  getAppEnvironment,
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
} from "@schemavaults/app-definitions";
import { SchemaVaultsAppEnvironmentContext } from "@/contexts/app-environment-context";
import { type PropsWithChildren, useMemo, type ReactElement } from "react";
import { getAppEnvironmentOnClient } from "@/lib/get-app-environment-on-client";

export interface SchemaVaultsAppEnvironmentContextProviderProps
  extends PropsWithChildren {
  verbose?: boolean;
  environment?: SchemaVaultsAppEnvironment;
}

export function SchemaVaultsAppEnvironmentContextProvider({
  children,
  verbose,
  ...props
}: SchemaVaultsAppEnvironmentContextProviderProps): ReactElement {
  const app_env: SchemaVaultsAppEnvironment | undefined = useMemo(():
    | SchemaVaultsAppEnvironment
    | undefined => {
    if (
      typeof props.environment === "string" &&
      schemaVaultsAppEnvironmentSchema.safeParse(props.environment).success
    ) {
      return props.environment;
    }

    try {
      // Try to load environment based on the current URL for client
      if (window) {
        if (verbose) {
          console.log(
            "[SchemaVaultsAppEnvironmentContextProvider] Loading environment from client-side...",
          );
        }
        return getAppEnvironmentOnClient(window);
      }
    } catch (e: unknown) {
      /** no-op */
      void e;
    }

    try {
      const serverSideAppEnv: SchemaVaultsAppEnvironment = getAppEnvironment();
      if (
        schemaVaultsAppEnvironmentSchema.safeParse(serverSideAppEnv).success
      ) {
        return serverSideAppEnv;
      }
    } catch (e: unknown) {
      /** no-op */
      void e;
    }

    // Else, client will have to fetch /api/environment to load current app environment

    return undefined;
  }, [props.environment, verbose]);

  if (!app_env) {
    throw new Error(
      "Failed to load app environment within SchemaVaultsAppEnvironmentContextProvider!",
    );
  }

  return (
    <SchemaVaultsAppEnvironmentContext.Provider
      value={app_env}
      key={`schemavaults-app-environment-provider-[${app_env}]`}
    >
      {children}
    </SchemaVaultsAppEnvironmentContext.Provider>
  );
}

export default SchemaVaultsAppEnvironmentContextProvider;
