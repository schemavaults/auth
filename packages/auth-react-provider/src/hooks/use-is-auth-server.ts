"use client";
import { useMemo } from "react";
import useAppId from "./use-app-id";
import {
  type AppId,
  SCHEMAVAULTS_AUTH_APP_ID,
} from "@schemavaults/app-definitions";

export function useIsAuthServer(): boolean {
  const appId: AppId = useAppId();
  return useMemo(() => appId === SCHEMAVAULTS_AUTH_APP_ID, [appId]);
}

export default useIsAuthServer;
