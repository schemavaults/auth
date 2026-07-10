"use client";

import type { ReactElement } from "react";
import type { SchemaVaultsAuthProviderProps } from "@/types/SchemaVaultsAuthProviderProps";

// Core Auth Provider Logic
import CoreSchemaVaultsAuthClientProvider from "./core-schemavaults-auth-client-provider";

// Subproviders
import SchemaVaultsAppEnvironmentContextProvider from "@/subproviders/app-environment-provider";
import AppIdProvider from "@/subproviders/app-id-provider";
import AuthServerAppIdProvider from "@/subproviders/auth-server-app-id-provider";
import DefaultAccessTokenAudiencesProvider from "@/subproviders/default-access-token-audiences-provider";
import OnLogoutProvider from "@/subproviders/on-logout-provider";
import RedirectUrlConfigurationProvider from "@/subproviders/redirect-url-configuration-provider";

/**
 * @name SchemaVaultsAuthProvider
 * @see CoreSchemaVaultsAuthProvider
 * @returns App wrapped in AuthProvider
 */
export function SchemaVaultsAuthProvider(
  props: SchemaVaultsAuthProviderProps,
): ReactElement {
  return (
    <SchemaVaultsAppEnvironmentContextProvider
      environment={props.environment}
      verbose={props.debug ? true : false}
    >
      <AppIdProvider app_id={props.app_id}>
        <AuthServerAppIdProvider auth_server_app_id={props.auth_server_app_id}>
          <DefaultAccessTokenAudiencesProvider
            default_audiences={props.default_audiences}
          >
            <OnLogoutProvider onLogout={props.onLogout}>
              <RedirectUrlConfigurationProvider {...props}>
                <CoreSchemaVaultsAuthClientProvider {...props} />
              </RedirectUrlConfigurationProvider>
            </OnLogoutProvider>
          </DefaultAccessTokenAudiencesProvider>
        </AuthServerAppIdProvider>
      </AppIdProvider>
    </SchemaVaultsAppEnvironmentContextProvider>
  );
}

export default SchemaVaultsAuthProvider;

export type { SchemaVaultsAuthProviderProps } from "@/types/SchemaVaultsAuthProviderProps";
