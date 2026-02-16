"use client";

import DefaultAccessTokenAudiencesContext from "@/contexts/default-access-token-audiences-context";
import {
  type ApiServerId,
  apiServerIdSchema,
} from "@schemavaults/app-definitions";
import { useMemo, type PropsWithChildren, type ReactElement } from "react";

export interface DefaultAccessTokenAudiencesProviderProps
  extends PropsWithChildren {
  default_audiences?: readonly ApiServerId[] | undefined;
}

export default function DefaultAccessTokenAudiencesProvider({
  default_audiences,
  children,
}: DefaultAccessTokenAudiencesProviderProps): ReactElement {
  const validated_audiences: readonly ApiServerId[] | undefined =
    useMemo(() => {
      if (typeof default_audiences === "undefined") {
        return undefined;
      }
      const parsed = apiServerIdSchema
        .array()
        .readonly()
        .safeParse(default_audiences);
      if (!parsed.success) {
        throw new TypeError(
          "Invalid API server ID(s) in default access token audiences for @schemavaults/auth-react-provider!",
        );
      }
      return parsed.data;
    }, [default_audiences]);

  return (
    <DefaultAccessTokenAudiencesContext.Provider value={validated_audiences}>
      {children}
    </DefaultAccessTokenAudiencesContext.Provider>
  );
}
