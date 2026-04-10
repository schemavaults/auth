"use client";

import { useRouter } from "next/navigation";
import useAuth from "@/hooks/use-auth";
import { useEffect } from "react";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useAppEnvironment, {
  type SchemaVaultsAppEnvironment,
} from "@/hooks/use-app-environment";
import useDebug from "@/hooks/use-debug";
import useCheckIfAuthenticatedWithServer from "@/hooks/use-check-if-authenticated-with-server";
import useIsAuthServer from "@/hooks/use-is-auth-server";
import useDefaultAccessTokenAudiences from "./use-default-access-token-audiences";
import type { ApiServerId } from "@schemavaults/app-definitions";

export interface IUseStartLoginOauthPKCEFlowOpts {
  onError: (e: unknown) => void;
}

type UnsubscribeFn = () => void;

export function useStartLoginOauthPKCEFlow({
  onError,
}: IUseStartLoginOauthPKCEFlowOpts) {
  const router = useRouter();
  const authContext = useAuth();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const debug: boolean = useDebug(environment);
  const checkIfAuthenticatedWithServer = useCheckIfAuthenticatedWithServer();
  const isAuthServer: boolean = useIsAuthServer();
  const defaultAccessTokenAudiences: readonly ApiServerId[] | undefined =
    useDefaultAccessTokenAudiences();

  useEffect((): void | UnsubscribeFn => {
    if (isAuthServer) {
      throw new Error(
        "useStartLoginOauthPKCEFlow should not be run from @schemavaults/auth-server!",
      );
    }

    let cancelLoginEffect: boolean = false;

    async function startLoginPkceFlow(
      auth: ISchemaVaultsAuthClient,
    ): Promise<void> {
      if (cancelLoginEffect) {
        if (debug) {
          console.warn(
            "Cancelling startLoginPkceFlow due to effect unsubscribe!",
          );
        }
        return;
      }
      await auth.login();
    }

    async function acquireDefaultAccessTokens(
      auth: ISchemaVaultsAuthClient,
    ): Promise<void> {
      if (!defaultAccessTokenAudiences) return;
      await Promise.all(
        defaultAccessTokenAudiences.map(async (defaultAccessTokenAudience) => {
          await auth.acquireAccessToken({
            audience: defaultAccessTokenAudience,
            ensure_fresh: true,
          });
        }),
      );
      return;
    }

    async function handleAuthClientReady(
      auth: ISchemaVaultsAuthClient,
    ): Promise<void> {
      if (cancelLoginEffect) {
        return;
      }
      const clientAuthenticationBelief: boolean = auth.isAuthenticated
        ? true
        : false;
      let serverAuthenticationBelief: boolean = false;
      try {
        serverAuthenticationBelief = ((await checkIfAuthenticatedWithServer(
          auth,
        )) satisfies boolean)
          ? true
          : false;
      } catch (e: unknown) {
        // no-op
        console.error(
          "[useStartLoginOauthPKCEFlow] (No-op) Error checking if user already has a valid refresh token: ",
          e,
        );
      }

      const shouldLogin: boolean =
        !clientAuthenticationBelief && !serverAuthenticationBelief;

      if (!shouldLogin) {
        if (cancelLoginEffect) {
          return;
        }
        if (debug) {
          console.log(
            "[startLoginPkceFlow] User appears to already be logged in with a valid refresh token!",
          );
        }
        if (
          Array.isArray(defaultAccessTokenAudiences) &&
          defaultAccessTokenAudiences.length > 0
        ) {
          if (debug) {
            console.log(
              "[startLoginPkceFlow] They have refresh token-- but we need to make sure they have access tokens ready in order to potentially access server-side rendered account page!",
            );
          }
          try {
            await acquireDefaultAccessTokens(auth);
          } catch (e: unknown) {
            if (!auth.isAuthenticated) {
              // Session was invalidated (e.g. keyset expired) - start fresh login
              if (debug) {
                console.log(
                  "[startLoginPkceFlow] Session expired during access token acquisition, redirecting to login...",
                );
              }
              if (!cancelLoginEffect) {
                await startLoginPkceFlow(auth);
              }
              return;
            }
            throw e;
          }
        }

        if (debug) {
          console.log(
            "[startLoginPkceFlow] User appears to already be logged in! Not triggering Oauth2 PKCE flow-- but redirecting the user to 'successful_authentication_redirect_uri': ",
            auth.successful_authentication_redirect_uri,
          );
        }
        const redirect_uri: string =
          auth.successful_authentication_redirect_uri;
        if (cancelLoginEffect) {
          // don't redirect if page unmounted
          return;
        }
        router.push(redirect_uri);
        return;
      } else {
        if (debug) {
          console.log(
            "[startLoginPkceFlow] User does not appear to already be logged in... Starting Oauth2 PKCE flow!",
          );
        }
        await startLoginPkceFlow(auth);
        return;
      }
    }

    if (authContext.ready) {
      if (debug) {
        console.log("[useStartLoginOauthPKCEFlow] Auth client ready.");
      }
      const clientRef = authContext.client;
      if (!clientRef) {
        if (debug) {
          console.error(
            "[useStartLoginOauthPKCEFlow] Auth client not ready. -- null client ref.",
          );
        }
        return;
      }
      try {
        if (clientRef.current) {
          const auth: ISchemaVaultsAuthClient = clientRef.current;

          handleAuthClientReady(auth).catch(function onFailureStartingLoginFlow(
            e: unknown,
          ): void {
            console.error("Error starting login flow: ", e);

            return;
          });

          return function effectUnsubscribeHandler(): void {
            cancelLoginEffect = true;
          };
        }
      } catch (e: unknown) {
        if (debug) {
          console.error(
            "[useStartLoginOauthPKCEFlow] Error redirecting to login page: ",
            e,
          );
        }
      }
    } else {
      if (debug) {
        console.log("[useStartLoginOauthPKCEFlow] Auth client not ready.");
      }
    }
  }, [
    isAuthServer,
    authContext,
    debug,
    router,
    onError,
    checkIfAuthenticatedWithServer,
    defaultAccessTokenAudiences,
  ]);
}

export default useStartLoginOauthPKCEFlow;
