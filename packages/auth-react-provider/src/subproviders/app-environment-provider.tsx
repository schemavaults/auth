"use client";

import {
  type SchemaVaultsAppEnvironment,
  schemaVaultsAppEnvironmentSchema,
} from "@schemavaults/app-definitions";
import { SchemaVaultsAppEnvironmentContext } from "@/contexts/app-environment-context";
import { type PropsWithChildren, useMemo, type ReactElement } from "react";

export interface SchemaVaultsAppEnvironmentContextProviderProps
  extends PropsWithChildren {
  verbose?: boolean;
  environment: SchemaVaultsAppEnvironment;
}

export function SchemaVaultsAppEnvironmentContextProvider({
  children,
  verbose,
  environment,
}: SchemaVaultsAppEnvironmentContextProviderProps): ReactElement {
  const validated_app_env: SchemaVaultsAppEnvironment =
    useMemo((): SchemaVaultsAppEnvironment => {
      if (
        typeof environment === "string" &&
        schemaVaultsAppEnvironmentSchema.safeParse(environment).success
      ) {
        if (verbose) {
          console.log(
            "[SchemaVaultsAppEnvironmentContextProvider] environment: ",
            environment,
          );
        }
        return environment;
      } else {
        throw new TypeError(
          "Received invalid 'environment' to provide to children through SchemaVaultsAppEnvironmentContextProvider",
        );
      }
    }, [environment, verbose]);

  if (!validated_app_env) {
    throw new Error(
      "Failed to load app environment within SchemaVaultsAppEnvironmentContextProvider!",
    );
  }

  return (
    <SchemaVaultsAppEnvironmentContext.Provider
      value={validated_app_env}
      key={`schemavaults-app-environment-provider-[${validated_app_env}]`}
    >
      {children}
    </SchemaVaultsAppEnvironmentContext.Provider>
  );
}

export default SchemaVaultsAppEnvironmentContextProvider;
