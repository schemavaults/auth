"use client";

import AppIdContext from "@/contexts/app-id-context";
import type { AppId } from "@schemavaults/app-definitions";
import { useContext } from "react";

export function useAppId(): AppId {
  const app_id: AppId | null = useContext(AppIdContext);
  if (!app_id) {
    throw new Error(
      "Failed to resolve client application ID from context! Is this within a AppIdContext.Provider render tree?",
    );
  }
  return app_id;
}

export default useAppId;
