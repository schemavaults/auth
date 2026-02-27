"use client";

import { AccessToken, accessTokenExpiry } from "@schemavaults/auth-common";
import { useEffect } from "react";
import useAuth from "./use-auth";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useDefaultAccessTokenAudiences from "./use-default-access-token-audiences";
import { ApiServerId } from "@schemavaults/app-definitions";

const ACCESS_TOKEN_VALID_DURATION: number = accessTokenExpiry;
const REACQUIRE_INTERVAL: number = ACCESS_TOKEN_VALID_DURATION / 10;
// when 30% left in duration or less, reqacuire
const REACQUIRE_THRESHOLD: number = ACCESS_TOKEN_VALID_DURATION * 0.3;

export function useAutoReacquireDefaultAccessTokens(): void {
  const authContext = useAuth();
  const defaultAccessTokenAudiences = useDefaultAccessTokenAudiences();

  useEffect(() => {
    if (
      typeof defaultAccessTokenAudiences === "undefined" ||
      !Array.isArray(defaultAccessTokenAudiences)
    ) {
      return;
    }

    if (!authContext.ready || !authContext.client.current) {
      return;
    }
    const auth: ISchemaVaultsAuthClient = authContext.client.current;

    async function reacquireAccessTokenIfNearExpiry(
      audience: ApiServerId,
    ): Promise<AccessToken | null> {
      const existingAccessToken: AccessToken | null =
        auth.getAccessTokenFromCache(audience);
      if (!existingAccessToken) {
        return null;
      }
      const timeUntilExpiry: number = existingAccessToken.exp - Date.now();
      if (timeUntilExpiry <= 0) {
        // expired
        return null;
      }
      if (timeUntilExpiry < REACQUIRE_THRESHOLD) {
        return await auth.acquireAccessToken({
          audience,
          ensure_fresh: true,
          dont_cache: false,
        });
      } else {
        return null;
      }
    }

    async function onTimer(): Promise<void> {
      if (!auth.isAuthenticated) {
        return;
      }
      if (typeof defaultAccessTokenAudiences === "undefined") {
        return;
      }
      await Promise.all(
        defaultAccessTokenAudiences.map((audience) =>
          reacquireAccessTokenIfNearExpiry(audience),
        ),
      );
    }

    const reacquire_timer = setInterval(onTimer, REACQUIRE_INTERVAL);

    return function unsubscribe(): void {
      clearInterval(reacquire_timer);
      return;
    };
  }, [authContext]);
}

export default useAutoReacquireDefaultAccessTokens;
