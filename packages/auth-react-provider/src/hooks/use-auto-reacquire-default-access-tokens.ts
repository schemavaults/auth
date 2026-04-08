"use client";

import { type AccessToken, accessTokenExpiry } from "@schemavaults/auth-common";
import { useEffect, useEffectEvent } from "react";
import useAuth from "./use-auth";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useDefaultAccessTokenAudiences from "./use-default-access-token-audiences";
import type {
  ApiServerId,
  SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import useDebug from "@/hooks/use-debug";
import useAppEnvironment from "@/hooks/use-app-environment";

function secondsToMs(seconds: number): number {
  return seconds * 1000;
}

const ACCESS_TOKEN_VALID_DURATION: number = secondsToMs(accessTokenExpiry);
const REACQUIRE_INTERVAL: number = ACCESS_TOKEN_VALID_DURATION / 10;
// when 30% left in duration or less, reqacuire
const REACQUIRE_THRESHOLD: number = ACCESS_TOKEN_VALID_DURATION * 0.3;

export function useAutoReacquireDefaultAccessTokens(): void {
  const authContext = useAuth();
  const defaultAccessTokenAudiences = useDefaultAccessTokenAudiences();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const debug: boolean = useDebug(environment);

  const reacquireAccessTokenIfNearExpiry = useEffectEvent(
    async (
      auth: ISchemaVaultsAuthClient,
      audience: ApiServerId,
    ): Promise<AccessToken | null> => {
      if (debug) {
        console.log(
          `[useAutoReacquireDefaultAccessTokens] reacquireAccessTokenIfNearExpiry(audience="${audience}")`,
        );
      }

      const existingAccessToken: AccessToken | null =
        auth.getAccessTokenFromCache(audience);
      if (!existingAccessToken) {
        if (debug) {
          console.warn(
            `[useAutoReacquireDefaultAccessTokens] No existing access token for audience "${audience}" found!`,
          );
        }
        return null;
      }
      const timeUntilExpiry: number = existingAccessToken.exp - Date.now();
      if (timeUntilExpiry <= 0) {
        // expired
        if (debug) {
          console.warn(
            `[useAutoReacquireDefaultAccessTokens] Existing access token for audience "${audience}" expired!`,
          );
        }
        return null;
      }
      if (timeUntilExpiry < REACQUIRE_THRESHOLD) {
        if (debug) {
          console.log(
            `[useAutoReacquireDefaultAccessTokens] Attempting to acquire fresh access token for audience "${audience}"! Existing one is near expiration...`,
          );
        }
        return await auth.acquireAccessToken({
          audience,
          ensure_fresh: true,
          dont_cache: false,
        });
      } else {
        return null;
      }
    },
  );

  const onTimer: () => Promise<void> = useEffectEvent(
    async () => {
      if (!authContext.ready) {
        return;
      } else if (!authContext.client.current) {
        return;
      }
      const auth: ISchemaVaultsAuthClient = authContext.client.current;
      if (!auth.isAuthenticated) {
        return;
      }
      if (typeof defaultAccessTokenAudiences === "undefined") {
        return;
      }
      await Promise.all(
        defaultAccessTokenAudiences.map((audience) =>
          reacquireAccessTokenIfNearExpiry(auth, audience),
        ),
      );
      return;
    }, // onTimer()
  );

  useEffect(() => {
    if (
      typeof defaultAccessTokenAudiences === "undefined" ||
      !Array.isArray(defaultAccessTokenAudiences)
    ) {
      if (debug) {
        console.warn(
          "[useAutoReacquireDefaultAccessTokens] Default access token audiences not set.",
        );
      }
      return;
    }

    if (!authContext.ready || !authContext.client.current) {
      if (debug) {
        console.warn(
          "[useAutoReacquireDefaultAccessTokens] Not attempting to auto-reacquire access tokens near expiry-- auth client is not ready or is falsy",
        );
      }
      return;
    }

    if (debug) {
      console.log(
        "[useAutoReacquireDefaultAccessTokens] Starting timer with interval (ms): ",
        REACQUIRE_INTERVAL,
      );
    }

    const reacquire_timer = setInterval(onTimer, REACQUIRE_INTERVAL);

    return function unsubscribe(): void {
      clearInterval(reacquire_timer);
      return;
    };
  }, [defaultAccessTokenAudiences, authContext, debug]);
}

export default useAutoReacquireDefaultAccessTokens;
