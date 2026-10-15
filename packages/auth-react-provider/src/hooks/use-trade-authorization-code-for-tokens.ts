"use client";

import type { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import type { HookStatus } from "@/types/hook-status";
import { useAppEnvironment } from "./use-app-environment";
import {
  type ISchemaVaultsAuthClient,
  type LoginErrorPageTarget,
  resolveLoginErrorPage,
} from "@schemavaults/auth-client-sdk";
import { useDebugWithSpecifiedBooleanOrLookupDefault } from "./use-debug";

const enum AuthorizePageSearchParam {
  AuthorizationCode = "authorization_code",
  ChallengeTime = "challenge_time",
  State = "state",
  // RFC 9207: the auth server identifies itself on every authorization
  // response; the SDK verifies it against the configured auth server URL
  // (authorization-server mix-up protection).
  Issuer = "iss",
}

type TradeAuthorizationCodeResult = HookStatus<{ auth_state_set: boolean }>;

/**
 * The exchange started for each authorization code on this page load. React
 * re-runs the effect (StrictMode in development, changed dependencies), and
 * every run must act on the outcome of the one redemption: a code can be
 * redeemed only once, so a second attempt fails whatever the first one's
 * outcome was.
 */
const exchangesByAuthorizationCode: Map<
  string,
  Promise<TradeAuthorizationCodeResult>
> = new Map();

/** The callback URL lacks (or carries malformed) authorization parameters. */
class InvalidAuthorizeCallbackError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidAuthorizeCallbackError";
  }
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

    // Where to send the user when the code cannot be traded for tokens: the
    // error page, never back into the login flow. Retrying the login would
    // fail the same way (e.g. the app is not connected to its default
    // audience's API server) and, while the auth server's session cookie
    // is valid, bounce between the login and authorize pages forever.
    function buildErrorPageUrlForFailure(e: unknown): string {
      const target: LoginErrorPageTarget =
        e instanceof InvalidAuthorizeCallbackError
          ? { error_id: "bad_request", error_code: 400 }
          : resolveLoginErrorPage(e);
      try {
        return auth.buildErrorPageUrl(target.error_id, target.error_code);
      } catch (buildError: unknown) {
        console.error(
          "[useTradeAuthorizationCodeForTokensEffect] Failed to build error page URL: ",
          buildError,
        );
        return auth.error_page_uri;
      }
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

      const errorPageUrl: string = buildErrorPageUrlForFailure(e);
      if (debug) {
        console.log(
          `[useTradeAuthorizationCodeForTokensEffect] Redirecting to error page "${errorPageUrl}"`,
        );
      }
      router.replace(errorPageUrl);
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
      return cancelEffectUnsubscribeFn;
    }

    async function tradeAuthorizationCodeForTokensHandler(): Promise<TradeAuthorizationCodeResult> {
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
          error: new InvalidAuthorizeCallbackError(
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
          error: new InvalidAuthorizeCallbackError(
            "Failed to parse PKCE challenge time!",
          ),
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

      const received_state = searchParams.get(AuthorizePageSearchParam.State);
      const received_iss = searchParams.get(AuthorizePageSearchParam.Issuer);

      try {
        if (debug) {
          console.log(
            "[tradeAuthorizationCodeForTokensHandler] calling AuthClient.handleSuccessfulAuthentication()...",
          );
        }
        await auth.handleSuccessfulAuthentication(
          authorization_code,
          challenge_time,
          undefined,
          received_state,
          undefined,
          received_iss,
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
              { cause: e },
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

    const authorization_code_param: string | null = searchParams.get(
      AuthorizePageSearchParam.AuthorizationCode,
    );
    let exchange: Promise<TradeAuthorizationCodeResult> | undefined =
      authorization_code_param
        ? exchangesByAuthorizationCode.get(authorization_code_param)
        : undefined;
    if (exchange) {
      if (debug) {
        console.log(
          "[useTradeAuthorizationCodeForTokensEffect] Awaiting the exchange already started for this authorization code...",
        );
      }
    } else {
      exchange = tradeAuthorizationCodeForTokensHandler();
      if (authorization_code_param) {
        exchangesByAuthorizationCode.set(authorization_code_param, exchange);
      }
    }

    exchange
      .then((init_result: TradeAuthorizationCodeResult): void => {
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
