"use client";

import type { ReactElement } from "react";
import type { SchemaVaultsAuthProviderProps } from "./auth-provider-props";

// Auth Middleware Imports/Exports
import { type AuthMiddlewareRules } from "@schemavaults/auth-common";
export type { AuthMiddlewareRules };

import SchemaVaultsAppEnvironmentContextProvider from "@/subproviders/app-environment-provider";
import AppIdProvider from "@/subproviders/app-id-provider";
import DefaultAccessTokenAudiencesProvider from "@/subproviders/default-access-token-audiences-provider";
import CoreSchemaVaultsAuthClientProvider from "./core-schemavaults-auth-client-provider";

/**
 * @name SchemaVaultsAuthProvider
 * @see CoreSchemaVaultsAuthProvider
 * @returns App wrapped in AuthProvider
 */
export function SchemaVaultsAuthProvider(
  props: SchemaVaultsAuthProviderProps,
): ReactElement {
  return (
    <SchemaVaultsAppEnvironmentContextProvider environment={props.environment}>
      <AppIdProvider app_id={props.app_id}>
        <DefaultAccessTokenAudiencesProvider
          default_audiences={props.default_audiences}
        >
          <CoreSchemaVaultsAuthClientProvider {...props} />
        </DefaultAccessTokenAudiencesProvider>
      </AppIdProvider>
    </SchemaVaultsAppEnvironmentContextProvider>
  );
}

export default SchemaVaultsAuthProvider;

export type { SchemaVaultsAuthProviderProps } from "./auth-provider-props";
