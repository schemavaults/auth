"use client";

import { useCallback } from "react";

export default function useCheckIfAuthenticatedWithServer() {
  return useCallback(
    async function checkIfAuthenticatedWithServer(): Promise<boolean> {
      throw new Error("Unimplemented");
    },
    [],
  );
}
