"use client";

import OnLogoutContext, {
  type OnLogoutCallback,
} from "@/contexts/on-logout-context";
import type { PropsWithChildren, ReactElement } from "react";

export interface OnLogoutProviderProps extends PropsWithChildren {
  onLogout?: OnLogoutCallback;
}

export default function OnLogoutProvider({
  onLogout,
  children,
}: OnLogoutProviderProps): ReactElement {
  if (typeof onLogout !== "undefined" && typeof onLogout !== "function") {
    throw new TypeError(
      "Expected 'onLogout' to be a function if provided to AuthProvider!",
    );
  }

  return (
    <OnLogoutContext.Provider value={onLogout ?? null}>
      {children}
    </OnLogoutContext.Provider>
  );
}
