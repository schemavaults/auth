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
import { useAppEnvironment } from "@/hooks/use-app-environment";
import {
  getHardcodedClientWebAppDomain,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { SchemaVaultsAppEnvironmentContextProvider } from "@/subproviders/app-environment-provider";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "@/hooks/use-debug";
import DefaultSuccessfulAuthenticationRedirectPath from "@/constants/DefaultSuccessfulAuthenticationRedirectPath";
import DefaultPkceAuthorizeRedirectPath from "@/constants/DefaultPkceAuthorizeRedirectPath";

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
 * @name AppEnvironmentAwareAuthProvider
 * @returns App wrapped in AuthProvider
 */
function AppEnvironmentAwareAuthProvider(
  props: SchemaVaultsAuthProviderProps,
): ReactElement {
  const appEnvironment: SchemaVaultsAppEnvironment = useAppEnvironment();

  // throw if production/staging and not https
  assertHttpsInProduction(appEnvironment);

  const app_id: string = props.app_id;

  const authServerUri: string = useMemo(() => {
    if (typeof props.auth_server_uri === "string") {
      return props.auth_server_uri;
    }
    const hardcoded = getHardcodedClientWebAppDomain(
      SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
      appEnvironment,
    );
    return hardcoded;
  }, [props.auth_server_uri, appEnvironment]);

  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    appEnvironment,
    props.debug,
  );

  const successful_logout_redirect_uri: string = useMemo(() => {
    if (typeof props.successful_logout_redirect_uri === "string")
      return props.successful_logout_redirect_uri;
    try {
      const appDomain: string = getHardcodedClientWebAppDomain(
        app_id,
        appEnvironment,
      );
      return appDomain satisfies string;
    } catch (e: unknown) {
      console.error(e);
      throw new Error("Failed to query domain for app!");
    }
  }, [props.successful_logout_redirect_uri, appEnvironment, app_id]);

  const successful_authentication_redirect_uri: string = useMemo((): string => {
    if (typeof props.successful_authentication_redirect_uri === "string") {
      if (debug) {
        console.log(
          `[AppEnvironmentAwareAuthProvider] successful_authentication_redirect_uri="${props.successful_authentication_redirect_uri}" (source: props)`,
        );
      }
      return props.successful_authentication_redirect_uri;
    }

    console.assert(
      typeof props.successful_authentication_redirect_uri === "undefined",
      "Expected props.successful_authentication_redirect_uri to be undefined if this point was reached!",
    );

    try {
      const appDomain = getHardcodedClientWebAppDomain(app_id, appEnvironment);
      const withSuccessfulAuthenticationRedirectPath =
        `${appDomain}${DefaultSuccessfulAuthenticationRedirectPath}` as const satisfies string;

      if (debug) {
        console.log(
          `[AppEnvironmentAwareAuthProvider] successful_authentication_redirect_uri="${withSuccessfulAuthenticationRedirectPath}" (source: default for app)`,
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
  }, [
    app_id,
    appEnvironment,
    props.successful_authentication_redirect_uri,
    debug,
  ]);

  const authorize_uri: string | undefined = useMemo((): string | undefined => {
    if (typeof props.authorize_uri === "string") {
      if (debug) {
        console.log(
          `[AppEnvironmentAwareAuthProvider] authorize_uri="${props.authorize_uri}" (source: props)`,
        );
      }
      if (
        props.authorize_uri.startsWith("http://") ||
        props.authorize_uri.startsWith("https://")
      ) {
        return props.authorize_uri;
      } else if (props.authorize_uri.startsWith("/")) {
        let appDomain: string;
        try {
          appDomain = getHardcodedClientWebAppDomain(app_id, appEnvironment);
        } catch (e: unknown) {
          console.error("Failed to load web app domain: ", e);
          throw new Error(
            "Failed to load web app domain in order to build full HTTP/HTTPS authorize redirect url from supplied relative path!",
          );
        }
        return `${appDomain}${props.authorize_uri}`;
      } else {
        throw new SyntaxError(
          "Failed to parse the 'authorize_uri' passed to AuthProvider via props into a valid URL!",
        );
      }
    }

    console.assert(
      typeof props.authorize_uri === "undefined",
      "Expected props.authorize_uri to be undefined if this point was reached!",
    );

    if (app_id === SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id) {
      if (debug) {
        console.log(
          "[AppEnvironmentAwareAuthProvider] authorize_uri=undefined (PKCE flow not used for auth app!)",
        );
      }
      return undefined;
    }

    try {
      const appDomain = getHardcodedClientWebAppDomain(app_id, appEnvironment);
      const withAuthorizePath =
        `${appDomain}${DefaultPkceAuthorizeRedirectPath}` as const satisfies string;

      if (debug) {
        console.log(
          `[AppEnvironmentAwareAuthProvider] authorize_uri="${props.authorize_uri}" (source: default for app)`,
        );
      }

      return withAuthorizePath satisfies string;
    } catch (e: unknown) {
      console.error("Failed to load default path for authorize_uri: ", e);
      throw new Error("Failed to load default path for authorize_uri!");
    }
  }, [app_id, appEnvironment, props.authorize_uri, debug]);

  const authClientRef: RefObject<ISchemaVaultsAuthClient | null> =
    useRef<ISchemaVaultsAuthClient | null>(null);

  const [ready, setReady] = useState<boolean>(false);

  const useAuthClientInitializationOptions: UseAuthClientInitializationOptions =
    {
      auth_server_uri: authServerUri,
      authClientRef,
      ready,
      setReady,
      successful_authentication_redirect_uri,
      successful_logout_redirect_uri,
      app_id,
      default_audiences: props.default_audiences,
      debug,
      authorize_uri,
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
      <AuthProviderSideEffects {...props} ready={ready} debug={debug}>
        {props.children}
      </AuthProviderSideEffects>
    </SchemaVaultsAuthContext.Provider>
  );
}

/**
 * @name SchemaVaultsAuthProvider
 * @see AppEnvironmentAwareAuthProvider
 * @returns App wrapped in AuthProvider
 */
export function SchemaVaultsAuthProvider(
  props: SchemaVaultsAuthProviderProps,
): ReactElement {
  return (
    <SchemaVaultsAppEnvironmentContextProvider environment={props.environment}>
      <AppEnvironmentAwareAuthProvider {...props} />
    </SchemaVaultsAppEnvironmentContextProvider>
  );
}

export default SchemaVaultsAuthProvider;
