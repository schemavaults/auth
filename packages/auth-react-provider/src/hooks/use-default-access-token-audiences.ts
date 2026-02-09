"use client";

import DefaultAccessTokenAudiencesContext from "@/contexts/default-access-token-audiences-context";
import type { ApiServerId } from "@schemavaults/app-definitions";
import { useContext } from "react";

export function useDefaultAccessTokenAudiences():
  | readonly ApiServerId[]
  | undefined {
  const defaultAccessTokenAudiences = useContext(
    DefaultAccessTokenAudiencesContext,
  );
  if (
    !Array.isArray(defaultAccessTokenAudiences) &&
    typeof defaultAccessTokenAudiences !== "undefined"
  ) {
    throw new Error(
      "Failed to resolve default access token audiences! Is this within a DefaultAccessTokenAudiencesContext.Provider render tree?",
    );
  }
  return defaultAccessTokenAudiences;
}

export default useDefaultAccessTokenAudiences;
