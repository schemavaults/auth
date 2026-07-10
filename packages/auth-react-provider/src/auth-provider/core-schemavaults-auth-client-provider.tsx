"use client";

import {
  useRef,
  type ReactElement,
  useState,
  type RefObject,
  useMemo,
} from "react";
import SchemaVaultsAuthContext, {
  type SchemaVaultsAuthContextType,
} from "@/contexts/auth-client-context";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import type { SchemaVaultsAuthProviderProps } from "@/types/SchemaVaultsAuthProviderProps";

// Auth Middleware Imports/Exports
import { type AuthMiddlewareRules } from "@schemavaults/auth-common";
export type { AuthMiddlewareRules };
import useAuthClientInitialization, {
  type UseAuthClientInitializationOptions,
} from "@/hooks/use-auth-client-initialization";
import {
  type ApiServerId,
  type AppId,
  getAuthServerUrl,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "@/hooks/use-debug";
import useAppId from "@/hooks/use-app-id";
import useAuthServerAppId from "@/hooks/use-auth-server-app-id";
import useDefaultAccessTokenAudiences from "@/hooks/use-default-access-token-audiences";
import AuthProviderSideEffects from "./auth-provider-side-effects";
import assertHttpsInProduction from "@/lib/assert-https-in-production";
import type { IAuthProviderRedirectUrlConfigurationWithDefaultsSet } from "@/types/IAuthProviderRedirectUrlConfiguration";
import useRedirectUrlConfiguration from "@/hooks/use-redirect-url-configuration";

/**
 * @name CoreSchemaVaultsAuthProvider
 * @returns App wrapped in AuthProvider
 */
export default function CoreSchemaVaultsAuthClientProvider(
  props: Omit<
    SchemaVaultsAuthProviderProps,
    keyof IAuthProviderRedirectUrlConfigurationWithDefaultsSet
  >,
): ReactElement {
  const appEnvironment: SchemaVaultsAppEnvironment = props.environment;
  // throw if production/staging and not https
  assertHttpsInProduction(appEnvironment);

  const app_id: AppId = useAppId();
  const auth_server_app_id: AppId = useAuthServerAppId();

  if (typeof props.fetch !== "function") {
    throw new TypeError("Expected 'fetch' to be a function!");
  }

  const authServerUri: string = useMemo(() => {
    if (typeof props.auth_server_url === "string") {
      return props.auth_server_url;
    } else {
      // default auth server uri
      return getAuthServerUrl(appEnvironment);
    }
  }, [props.auth_server_url, appEnvironment]);

  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    appEnvironment,
    props.debug,
  );

  const {
    successful_logout_redirect_uri,
    successful_authentication_redirect_uri,
    authorize_uri,
    error_page_uri,
  }: IAuthProviderRedirectUrlConfigurationWithDefaultsSet =
    useRedirectUrlConfiguration();

  const authClientRef: RefObject<ISchemaVaultsAuthClient | null> =
    useRef<ISchemaVaultsAuthClient | null>(null);

  const [ready, setReady] = useState<boolean>(false);

  const default_audiences: readonly ApiServerId[] | undefined =
    useDefaultAccessTokenAudiences();

  const useAuthClientInitializationOptions: UseAuthClientInitializationOptions =
    {
      auth_server_url: authServerUri,
      authClientRef,
      ready,
      setReady,
      successful_authentication_redirect_uri,
      successful_logout_redirect_uri,
      app_id,
      auth_server_app_id,
      default_audiences,
      debug,
      authorize_uri,
      error_page_uri,
      environment: appEnvironment,
      invite_code_required:
        typeof props.invite_code_required === "boolean"
          ? props.invite_code_required
          : true,
      fetch: props.fetch,
    };

  // Initialize auth client, store in the authClientRef
  useAuthClientInitialization(useAuthClientInitializationOptions);

  return (
    <SchemaVaultsAuthContext.Provider
      value={
        ready
          ? ({
              ready,
              client: authClientRef,
            } satisfies SchemaVaultsAuthContextType)
          : ({
              ready,
              message: "Auth client not initialized.",
            } satisfies SchemaVaultsAuthContextType)
      }
    >
      {props.children}
      <AuthProviderSideEffects {...props} debug={debug} />
    </SchemaVaultsAuthContext.Provider>
  );
}
