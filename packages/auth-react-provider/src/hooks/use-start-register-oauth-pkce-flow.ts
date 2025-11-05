"use client";

import type { useRouter } from "next/navigation";
import useEffectIfAuthenticated from "@/hooks/use-effect-if-authenticated";
import useAuth from "@/hooks/use-auth";
import { useEffect } from "react";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useAppEnvironment, {
  type SchemaVaultsAppEnvironment,
} from "@/hooks/use-app-environment";
import type { UseUiToastHook } from "@/lib/UiToastFn";
import useDebug from "@/hooks/use-debug";

export function useStartRegisterOauthPKCEFlow(
  useAppRouter: typeof useRouter,
  checkIfAuthenticatedWithServer: () => Promise<boolean>,
  useToast: UseUiToastHook,
) {
  const router: ReturnType<typeof useRouter> = useAppRouter();
  const authContext = useAuth();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const debug: boolean = useDebug(environment);
  const { toast } = useToast();

  useEffectIfAuthenticated((auth: ISchemaVaultsAuthClient) => {
    if (debug) {
      console.log("[useEffectIfAuthenticated] Sending to account page...");
    }
    const redirect_uri: string = auth.successful_authentication_redirect_uri;
    router.push(redirect_uri);
    return () => {};
  });

  useEffect(() => {
    let cancelRegisterEffect: boolean = false;

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

    async function startRegisterPkceFlow(
      auth: ISchemaVaultsAuthClient,
    ): Promise<void> {
      if (cancelRegisterEffect) {
        return;
      }
      await auth.register();
    }

    async function handleAuthClientReady(
      auth: ISchemaVaultsAuthClient,
    ): Promise<void> {
      if (cancelRegisterEffect) {
        return;
      }
      let isAuthenticated: boolean = false;
      try {
        isAuthenticated = await checkIfAlreadyAuthenticated(auth);
      } catch (e: unknown) {
        // no-op
        console.error(
          "[useStartRegisterOauthPKCEFlow] Error checking if user is already authenticated: ",
          e,
        );
      }

      if (isAuthenticated) {
        if (debug) {
          console.log(
            "[startRegisterPkceFlow] User appears to already be logged in! Not triggering Oauth2 PKCE flow-- a different effect should redirect the user to the account page...",
          );
        }
        return;
      } else {
        if (debug) {
          console.log(
            "[startRegisterPkceFlow] User does not appear to already be logged in... Starting Oauth2 PKCE flow!",
          );
        }
        await startRegisterPkceFlow(auth);
        return;
      }
    }

    if (authContext.ready) {
      if (debug) {
        console.log("[useStartRegisterOauthPKCEFlow] Auth client ready.");
      }
      const clientRef = authContext.client;
      if (!clientRef) {
        if (debug) {
          console.error(
            "[useStartRegisterOauthPKCEFlow] Auth client not ready. -- null client ref.",
          );
        }
        return;
      }
      try {
        if (clientRef.current) {
          const auth: ISchemaVaultsAuthClient = clientRef.current;

          handleAuthClientReady(auth).catch(
            function onFailureStartingRegisterFlow(e: unknown): void {
              console.error("Error starting register flow: ", e);
              toast({
                variant: "destructive",
                title: "Error starting register flow!",
                description:
                  e instanceof Error
                    ? e.message
                    : "An unknown error has occurred!",
              });
              return;
            },
          );

          return function effectUnsubscribeHandler(): void {
            cancelRegisterEffect = true;
          };
        }
      } catch (e: unknown) {
        if (debug) {
          console.error(
            "[useStartRegisterOauthPKCEFlow] Error redirecting to register page: ",
            e,
          );
        }
      }
    } else {
      if (debug) {
        console.log("[useStartRegisterOauthPKCEFlow] Auth client not ready.");
      }
    }
  }, [authContext, debug, router, toast]);
}

export default useStartRegisterOauthPKCEFlow;
