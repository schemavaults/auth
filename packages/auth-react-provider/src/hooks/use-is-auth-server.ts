"use client";
import { useMemo } from "react";
import useAppId from "./use-app-id";
import useAuthServerAppId from "./use-auth-server-app-id";
import type { AppId } from "@schemavaults/app-definitions";

export function useIsAuthServer(): boolean {
  const appId: AppId = useAppId();
  const authServerAppId: AppId = useAuthServerAppId();
  return useMemo(
    () => appId === authServerAppId,
    [appId, authServerAppId],
  );
}

export default useIsAuthServer;
