"use client";

import {
  useRef,
  type ReactElement,
  useState,
  type RefObject,
  type ReactNode,
  useMemo,
} from "react";
import {
  SchemaVaultsAuthContext,
  type SchemaVaultsAuthContextType,
} from "@/contexts/auth-client-context";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import type { SchemaVaultsAuthProviderProps } from "./auth-provider-props";

// Auth Middleware Imports/Exports
import { type AuthMiddlewareRules } from "@schemavaults/auth-common";
export type { AuthMiddlewareRules };
import useAuthClientInitialization, {
  type UseAuthClientInitializationOptions,
} from "@/hooks/use-auth-client-initialization";
import { AuthMiddlewareManager } from "./auth-middleware-manager";
import {
  ApiServerId,
  type AppId,
  getAuthServerUri,
  getHardcodedClientWebAppDomain,
  isHardcodedAppId,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { SchemaVaultsAppEnvironmentContextProvider } from "@/subproviders/app-environment-provider";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "@/hooks/use-debug";
import DefaultSuccessfulAuthenticationRedirectPath from "@/constants/DefaultSuccessfulAuthenticationRedirectPath";
import DefaultPkceAuthorizeRedirectPath from "@/constants/DefaultPkceAuthorizeRedirectPath";
import AppIdProvider from "@/subproviders/app-id-provider";
import useAppId from "@/hooks/use-app-id";
import DefaultAccessTokenAudiencesProvider from "@/subproviders/default-access-token-audiences-provider";
import useDefaultAccessTokenAudiences from "@/hooks/use-default-access-token-audiences";
import useAutoReacquireDefaultAccessTokens from "@/hooks/use-auto-reacquire-default-access-tokens";

function AutoReacquireAccessTokens(): null {
  useAutoReacquireDefaultAccessTokens();
  return null;
}

export interface AuthSideEffectsProps extends SchemaVaultsAuthProviderProps {
  children: ReactNode;
  ready: boolean;
  debug: boolean;
}

function AuthProviderSideEffects({
  children,
  ready,
  ...props
}: AuthSideEffectsProps): ReactNode {
  return ready ? (
    <AuthMiddlewareManager {...props}>{children}</AuthMiddlewareManager>
  ) : (
    children
  );
}

function assertHttpsInProduction(
  appEnvironment: SchemaVaultsAppEnvironment,
): void {
  if (appEnvironment === "production" || appEnvironment === "staging") {
    if (
      typeof window !== "undefined" &&
      window.location.protocol !== "https:"
    ) {
      throw new Error(
        `Insecure context: HTTPS is required in production or staging environments.` +
          ` Current environment: ${appEnvironment}`,
      );
    }
  }
}

/**
 * @name CoreSchemaVaultsAuthProvider
 * @returns App wrapped in AuthProvider
 */
function CoreSchemaVaultsAuthProvider(
  props: SchemaVaultsAuthProviderProps,
): ReactElement {
  const appEnvironment: SchemaVaultsAppEnvironment = props.environment;
  // throw if production/staging and not https
  assertHttpsInProduction(appEnvironment);

  const app_id: AppId = useAppId();

  if (typeof props.fetch !== "function") {
    throw new TypeError("Expected 'fetch' to be a function!");
  }

  const authServerUri: string = useMemo(() => {
    if (typeof props.auth_server_uri === "string") {
      return props.auth_server_uri;
    } else {
      // default auth server uri
      return getAuthServerUri(appEnvironment);
    }
  }, [props.auth_server_uri, appEnvironment]);

  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    appEnvironment,
    props.debug,
  );

  const successful_logout_redirect_uri: string = useMemo(() => {
    if (typeof props.successful_logout_redirect_uri === "string") {
      return props.successful_logout_redirect_uri;
    }
    // Else, successful_logout_redirect_uri was not explicitly set

    if (debug) {
      console.warn(
        "[AuthProvider] A 'successful_logout_redirect_uri' was not explicitly set!",
      );
    }

    if (isHardcodedAppId(app_id)) {
      // default to homepage of app
      try {
        const appDomain: string = getHardcodedClientWebAppDomain(
          app_id,
          appEnvironment,
        );
        return appDomain satisfies string;
      } catch (e: unknown) {
        console.error("Failed to query domain for hardcoded app: ", e);
        throw new Error(
          "Failed to query domain for hardcoded app to use as post-logout redirect page!",
        );
      }
    }

    throw new Error(
      "No 'successful_logout_redirect_uri' was set, and failed to automatically resolve a default!",
    );
  }, [props.successful_logout_redirect_uri, appEnvironment, app_id, debug]);

  const successful_authentication_redirect_uri: string = useMemo((): string => {
    if (typeof props.successful_authentication_redirect_uri === "string") {
      if (debug) {
        console.log(
          `[CoreSchemaVaultsAuthProvider] successful_authentication_redirect_uri="${props.successful_authentication_redirect_uri}" (source: props)`,
        );
      }
      return props.successful_authentication_redirect_uri;
    }

    if (debug) {
      console.warn(
        "No 'successful_authentication_redirect_uri' has been explicitly defined if this point was reached!",
      );
    }

    if (isHardcodedAppId(app_id)) {
      try {
        const appDomain: string = getHardcodedClientWebAppDomain(
          app_id,
          appEnvironment,
        );
        const withSuccessfulAuthenticationRedirectPath =
          `${appDomain}${DefaultSuccessfulAuthenticationRedirectPath}` as const satisfies string;

        if (debug) {
          console.log(
            `[CoreSchemaVaultsAuthProvider] successful_authentication_redirect_uri="${withSuccessfulAuthenticationRedirectPath}" (source: default for app)`,
          );
        }

        return withSuccessfulAuthenticationRedirectPath satisfies string;
      } catch (e: unknown) {
        console.error(
          "Failed to load default path for successful_authentication_redirect_uri: ",
          e,
        );
        throw new Error(
          "Failed to load default path for successful_authentication_redirect_uri!",
        );
      }
    } else {
      throw new Error(
        "No 'successful_authentication_redirect_uri' has been explicitly defined, and failed to resolve default 'successful_authentication_redirect_uri'!",
      );
    }
  }, [
    app_id,
    appEnvironment,
    props.successful_authentication_redirect_uri,
    debug,
  ]);

  const authorize_uri: string | undefined = useMemo((): string | undefined => {
    if (app_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
      if (typeof props.authorize_uri !== "undefined") {
        throw new TypeError(
          "An 'authorize_uri' is set, but it should not used for the @schemavaults/auth-server app!",
        );
      }
      return undefined;
    }

    if (typeof props.authorize_uri === "string") {
      if (debug) {
        console.log(
          `[CoreSchemaVaultsAuthProvider] authorize_uri="${props.authorize_uri}" (source: props)`,
        );
      }
      if (
        props.authorize_uri.startsWith("http://") ||
        props.authorize_uri.startsWith("https://")
      ) {
        return props.authorize_uri;
      } else if (props.authorize_uri.startsWith("/")) {
        if (isHardcodedAppId(app_id)) {
          try {
            const appDomain = getHardcodedClientWebAppDomain(
              app_id,
              appEnvironment,
            );
            return `${appDomain}${props.authorize_uri}`;
          } catch (e: unknown) {
            console.error("Failed to load web app domain: ", e);
            throw new Error(
              "Failed to load web app domain in order to build full HTTP/HTTPS authorize redirect url from supplied relative path!",
            );
          }
        } else {
          return props.authorize_uri;
        }
      } else {
        throw new SyntaxError(
          "Failed to parse the 'authorize_uri' passed to AuthProvider via props into a valid URL!",
        );
      }
    }

    if (props.authorize_uri) {
      throw new Error(
        "Expected props.authorize_uri to be undefined if this point was reached!",
      );
    }

    if (isHardcodedAppId(app_id)) {
      try {
        const appDomain = getHardcodedClientWebAppDomain(
          app_id,
          appEnvironment,
        );
        const withAuthorizePath =
          `${appDomain}${DefaultPkceAuthorizeRedirectPath}` as const satisfies string;

        if (debug) {
          console.log(
            `[CoreSchemaVaultsAuthProvider] authorize_uri="${props.authorize_uri}" (source: default for app)`,
          );
        }

        return withAuthorizePath satisfies string;
      } catch (e: unknown) {
        console.error(
          `Failed to load default path for 'authorize_uri' for hardcoded app '${app_id}': `,
          e,
        );
        throw new Error(
          `Failed to load default path for authorize_uri for hardcoded app '${app_id}'!`,
        );
      }
    } else {
      throw new Error(
        "Failed to resolve 'authorize_uri' for non-hardcoded app!",
      );
    }
  }, [app_id, appEnvironment, props.authorize_uri, debug]);

  const authClientRef: RefObject<ISchemaVaultsAuthClient | null> =
    useRef<ISchemaVaultsAuthClient | null>(null);

  const [ready, setReady] = useState<boolean>(false);

  const default_audiences: readonly ApiServerId[] | undefined =
    useDefaultAccessTokenAudiences();

  const useAuthClientInitializationOptions: UseAuthClientInitializationOptions =
    {
      auth_server_uri: authServerUri,
      authClientRef,
      ready,
      setReady,
      successful_authentication_redirect_uri,
      successful_logout_redirect_uri,
      app_id,
      default_audiences,
      debug,
      authorize_uri,
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
              message: "Auth client not ready.",
            } satisfies SchemaVaultsAuthContextType)
      }
    >
      {props.autoreacquire_access_tokens &&
        Array.isArray(default_audiences) &&
        default_audiences.length > 0 && <AutoReacquireAccessTokens />}
      <AuthProviderSideEffects {...props} ready={ready} debug={debug}>
        {props.children}
      </AuthProviderSideEffects>
    </SchemaVaultsAuthContext.Provider>
  );
}

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
          <CoreSchemaVaultsAuthProvider {...props} />
        </DefaultAccessTokenAudiencesProvider>
      </AppIdProvider>
    </SchemaVaultsAppEnvironmentContextProvider>
  );
}

export default SchemaVaultsAuthProvider;
