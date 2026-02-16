"use client";

import AppIdContext from "@/contexts/app-id-context";
import { appIdSchema, type AppId } from "@schemavaults/app-definitions";
import { useMemo, type PropsWithChildren, type ReactElement } from "react";

export interface AppIdProviderProps extends PropsWithChildren {
  app_id: AppId;
}

export default function AppIdProvider({
  app_id,
  children,
}: AppIdProviderProps): ReactElement {
  const validated_app_id: AppId = useMemo(() => {
    const parsed = appIdSchema.safeParse(app_id);
    if (!parsed.success) {
      throw new TypeError(
        "Invalid app ID for @schemavaults/auth-react-provider!",
      );
    }
    return parsed.data;
  }, [app_id]);

  return (
    <AppIdContext.Provider value={validated_app_id}>
      {children}
    </AppIdContext.Provider>
  );
}
