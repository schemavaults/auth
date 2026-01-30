"use client";

import { useRouter } from "next/navigation";
import useEffectIfAuthenticated from "@/hooks/use-effect-if-authenticated";
import useAuth from "@/hooks/use-auth";
import { useEffect } from "react";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useAppEnvironment, {
  type SchemaVaultsAppEnvironment,
} from "@/hooks/use-app-environment";
import useDebug from "@/hooks/use-debug";
import useCheckIfAuthenticatedWithServer from "@/hooks/useCheckIfAuthenticatedWithServer";

export interface IUseStartLoginOauthPKCEFlowOpts {
  onError: (e: unknown) => void;
}

export function useStartLoginOauthPKCEFlow({
  onError,
}: IUseStartLoginOauthPKCEFlowOpts) {
  const router = useRouter();
  const authContext = useAuth();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const debug: boolean = useDebug(environment);
  const checkIfAuthenticatedWithServer = useCheckIfAuthenticatedWithServer();

  useEffectIfAuthenticated((auth: ISchemaVaultsAuthClient) => {
    console.assert(
      !!auth.currentUser,
      "Expected user to be logged in if this point was reached-- but current user data is falsy!",
    );
    if (debug) {
      console.log("[useEffectIfAuthenticated] Sending to account page...");
    }
    const redirect_uri: string = auth.successful_authentication_redirect_uri;
    router.push(redirect_uri);
    return () => {};
  });

  useEffect(() => {
    let cancelLoginEffect: boolean = false;

    async function checkIfAlreadyAuthenticated(
      auth: ISchemaVaultsAuthClient,
    ): Promise<boolean> {
      if (!auth.isAuthenticated) {
        return false;
      }

      const hasValidRefreshTokenSet: boolean =
        await checkIfAuthenticatedWithServer();
      if (!hasValidRefreshTokenSet) {
        return false;
      }

      return true;
    }

    async function startLoginPkceFlow(
      auth: ISchemaVaultsAuthClient,
    ): Promise<void> {
      if (cancelLoginEffect) {
        return;
      }
      await auth.login();
    }

    async function handleAuthClientReady(
      auth: ISchemaVaultsAuthClient,
    ): Promise<void> {
      if (cancelLoginEffect) {
        return;
      }
      let isAuthenticated: boolean = false;
      try {
        isAuthenticated = await checkIfAlreadyAuthenticated(auth);
      } catch (e: unknown) {
        // no-op
        console.error(
          "[useStartLoginOauthPKCEFlow] Error checking if user is already authenticated: ",
          e,
        );
      }

      if (isAuthenticated) {
        if (debug) {
          console.log(
            "[startLoginPkceFlow] User appears to already be logged in! Not triggering Oauth2 PKCE flow-- a different effect should redirect the user to the account page...",
          );
        }
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
  }, [authContext, debug, router, onError, checkIfAuthenticatedWithServer]);
}

export default useStartLoginOauthPKCEFlow;
