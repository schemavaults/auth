"use client";

import type {
  ISchemaVaultsAuthClient,
  UserData,
} from "@schemavaults/auth-client-sdk";
import { useCallback } from "react";

export default function useCheckIfAuthenticatedWithServer() {
  return useCallback(async function checkIfAuthenticatedWithServer(
    auth: ISchemaVaultsAuthClient,
  ): Promise<boolean> {
    if (!auth.isAuthenticated) {
      // if client doesnt think its authenticated we wont bother double checking with the server
      return false;
    }
    const user: UserData | null = await auth.checkIfAuthenticatedWithServer();
    return user ? true : false;
  }, []);
}
