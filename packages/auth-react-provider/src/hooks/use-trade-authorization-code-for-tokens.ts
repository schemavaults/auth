"use client";

import type { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import type { HookStatus } from "@/types/hook-status";
import { useAppEnvironment } from "./use-app-environment";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "./use-debug";

const enum AuthorizePageSearchParam {
  AuthorizationCode = "authorization_code",
  ChallengeTime = "challenge_time",
}

export interface IUseTradeAuthorizationCodeForTokensEffectOptions {
  router: ReturnType<typeof useRouter>;
  searchParams: ReturnType<typeof useSearchParams>;
  auth: ISchemaVaultsAuthClient;
  toast?: (toastOpts: {
    title: string;
    description: string;
    variant?: "destructive" | "warning";
  }) => void;
  debug?: boolean;
}

export function useTradeAuthorizationCodeForTokensEffect(
  { router, searchParams, auth, toast, ...opts }: IUseTradeAuthorizationCodeForTokensEffectOptions,
): void {
  const environment = useAppEnvironment();
  const debug: boolean = useDebugWithSpecifiedBooleanOrLookupDefault(
    environment,
    opts.debug,
  );

  useEffect(function tradeAuthorizationCodeForTokensEffect(): () => void {
    let currentHref: string | undefined = undefined;
    try {
      if (window) {
        currentHref = window.location.href satisfies string;
      }
    } catch (e: unknown) {
      void e; // no-op
    }

    if (debug) {
      console.log(
        "[tradeAuthorizationCodeForTokensEffect] Attempting to trade authorization code for authentication tokens on path: ",
        currentHref,
      );
      if (typeof toast === "function") {
        console.log(
          "[tradeAuthorizationCodeForTokensEffect] Received 'toast' function to allow displaying info to end-user!",
        );
      }
    }

    let tradeCodeEffectCancelled: boolean = false;

    function cancelEffectUnsubscribeFn(): void {
      if (debug) {
        console.log(
          "[useTradeAuthorizationCodeForTokensEffect] cancelEffectUnsubscribeFn()",
        );
      }
      tradeCodeEffectCancelled = true;
    }

    if (debug && typeof toast === "function") {
      toast({
        title: "[DEV] useTradeAuthorizationCodeForTokensEffect",
        description:
          "Attempting to trade authorization code & code proof for tokens...",
      });
    }

    function onAuthHandlerSuccess(): void {
      if (tradeCodeEffectCancelled) {
        if (debug) {
          console.log(
            "[onAuthHandlerSuccess]",
            "Success handler called, but side effect cancelled!",
          );
        }
        return;
      }
      if (debug) {
        console.log(
          "[onAuthHandlerSuccess] Redirecting user after successful authentication!",
        );
      }
      router.replace(auth.successful_authentication_redirect_uri);
      return;
    }

    function onAuthHandlerFail(e?: unknown): void {
      if (tradeCodeEffectCancelled) return;
      if (typeof toast === "function") {
        toast({
          variant: "destructive",
          title: "Failed to trade authorization code for tokens",
          description:
            !!e && e instanceof Error
              ? e.message
              : "An unknown error occurred!",
        });
      }

      router.replace(auth.successful_logout_redirect_uri ?? "/");
      return;
    }

    if (auth.isAuthenticated) {
      if (typeof toast === "function") {
        toast({
          variant: "warning",
          title: "Already logged in!",
          description:
            "Please log out before attempting to log in to a different account!",
        });
      }
      onAuthHandlerSuccess();
    }

    async function tradeAuthorizationCodeForTokensHandler(): Promise<
      HookStatus<{ auth_state_set: boolean }>
    > {
      if (debug) {
        console.log("[tradeAuthorizationCodeForTokensHandler] running...");
      }

      const authorization_code = searchParams.get(
        AuthorizePageSearchParam.AuthorizationCode,
      );
      const challenge_time_str = searchParams.get(
        AuthorizePageSearchParam.ChallengeTime,
      );
      if (debug) {
        console.log(
          "[useTradeAuthorizationCodeForTokensEffect] Authorization code:",
          authorization_code,
        );
        console.log(
          "[useTradeAuthorizationCodeForTokensEffect] Challenge time:",
          challenge_time_str,
        );
      }
      if (!authorization_code || !challenge_time_str) {
        if (debug) {
          console.error(
            "[tradeAuthorizationCodeForTokensHandler] Missing authorization code or challenge time.",
          );
        }
        if (typeof toast === "function") {
          toast({
            variant: "destructive",
            title: "Missing authorization code or challenge time!",
            description: "Expected data not found within query parameters!",
          });
        }

        return {
          success: false,
          loading: false,
          error: new Error(
            "Missing authorization code or challenge time within query parameters!",
          ),
        };
      }
      const challenge_time = parseInt(challenge_time_str);
      if (isNaN(challenge_time)) {
        if (debug) {
          console.error(
            "[tradeAuthorizationCodeForTokensHandler] Challenge time is not a number.",
          );
        }
        if (typeof toast === "function") {
          toast({
            variant: "destructive",
            title: "Failed to parse PKCE challenge time!",
            description: "Please try again later...",
          });
        }

        return {
          success: false,
          loading: false,
          error: new Error("Failed to parse PKCE challenge time!"),
        };
      }

      try {
        const savedVerifiers = await auth.loadSavedAuthorizationCodeVerifiers();
        if (
          typeof savedVerifiers[challenge_time] === "string" &&
          savedVerifiers[challenge_time].startsWith("deleted-at-")
        ) {
          const full_deletion_time = Number(
            savedVerifiers[challenge_time].substring("deleted-at-".length),
          );
          if (isNaN(full_deletion_time)) {
            throw new Error(
              "Failed to load deletion time from deleted-at- code verifier soft deletion mark!",
            );
          }
          if (Math.abs(Date.now() - full_deletion_time) < 5000) {
            return {
              error: new Error(
                "Code verifier has already been used in the last 5 seconds!",
              ),
              loading: false,
              success: false,
            };
          }
        }
      } catch (e: unknown) {
        console.warn("Code verifier appears to have already been used, and there was an error handling this case: ", e);
      }

      // This uses PKCE behind the scenes to ensure that the authorization code is valid (and came from this client)

      try {
        if (debug) {
          console.log(
            "[tradeAuthorizationCodeForTokensHandler] calling AuthClient.handleSuccessfulAuthentication()...",
          );
        }
        await auth.handleSuccessfulAuthentication(
          authorization_code,
          challenge_time,
        );
      } catch (e: unknown) {
        if (e instanceof Error) {
          if (e.message.includes("already been used")) {
            console.warn("handleSuccessfulAuthentication() appears to have failed due to an 'already been used' error!", e.message)
            /** no-op */
          } else {
            console.error(
              "[tradeAuthorizationCodeForTokensHandler] Handle successful authentication handler failed: ",
              e,
            );
            if (typeof toast === "function") {
              toast({
                variant: "destructive",
                title: "Failed to acquire authentication tokens",
                description: "Successful authentication handler failed!",
              });
            }

            throw new Error(
              "Failed to exchange authorization code for refresh token using auth client!",
            );
          }
        }
      }
      if (debug) {
        console.log(
          "[tradeAuthorizationCodeForTokensHandler] Exchanging authorization code for refresh tokens appears to have been a success...",
        );
      }
      return {
        loading: false,
        success: true,
        data: {
          auth_state_set: true,
        },
      };
    } // end of tradeAuthorizationCodeForTokensHandler()

    if (debug) {
      console.log(
        "[useTradeAuthorizationCodeForTokensEffect] Calling tradeAuthorizationCodeForTokensHandler()...",
      );
    }

    tradeAuthorizationCodeForTokensHandler()
      .then((init_result: HookStatus<{ auth_state_set: boolean }>): void => {
        if (tradeCodeEffectCancelled) {
          if (debug) {
            console.log(
              "[useTradeAuthorizationCodeForTokensEffect] cancelling early due to unmount...",
            );
          }
        }

        if (!!init_result && !init_result.loading) {
          if (init_result.success) {
            if (init_result.data.auth_state_set) {
              if (debug) {
                console.log(
                  "[useTradeAuthorizationCodeForTokensEffect]",
                  "tradeAuthorizationCodeForTokensHandler ran successfully!",
                );
              }
              onAuthHandlerSuccess();
              return;
            } else {
              throw new Error(
                "Invalid shape returned, despite success result!",
              );
            }
          } else {
            console.error(
              `[useTradeAuthorizationCodeForTokensEffect] tradeAuthorizationCodeForTokensHandler returned error result: `,
              init_result.error,
            );
            onAuthHandlerFail(init_result.error);
            return;
          }
        } else {
          if (debug) {
            console.log(
              "[useTradeAuthorizationCodeForTokensEffect] " +
                "tradeAuthorizationCodeForTokensHandler indicated that the client is still in a loading state!",
            );
          }
        }
      })
      .catch((e: unknown): void => {
        if (tradeCodeEffectCancelled) {
          if (debug) {
            console.log(
              "[useTradeAuthorizationCodeForTokensEffect] cancelling early due to unmount...",
            );
          }
        }

        if (e instanceof Error) {
          if (e.message.includes("already been used")) {
            // fix react strict mode running twice
            return;
          }
        }
        console.error(
          "[useTradeAuthorizationCodeForTokensEffect] tradeAuthorizationCodeForTokensHandler failed: ",
          e,
        );
        onAuthHandlerFail(e);
      });

    return cancelEffectUnsubscribeFn;
  }, [toast, debug, router, searchParams, auth]);
}

export default useTradeAuthorizationCodeForTokensEffect;
