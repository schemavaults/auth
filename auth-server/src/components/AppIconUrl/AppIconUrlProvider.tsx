"use client";

import { createContext, useContext } from "react";
import type { PropsWithChildren, ReactElement } from "react";

// Defaults to null so a consumer rendered outside the provider fails loudly
// rather than silently rendering a stale (non-cache-busted) icon URL. The
// root layout always mounts <AppIconUrlProvider /> with the server-resolved
// resolveBrandingIconUrl() value.
const AppIconUrlContext = createContext<string | null>(null);

export interface AppIconUrlProviderProps extends PropsWithChildren {
  /**
   * @description Server-resolved resolveBrandingIconUrl() value: the
   * /branding/icon URL with a ?v= cache-busting content-hash version.
   * Serves the administrator-uploaded app icon when one exists (uploaded on
   * /admin/settings), falling back to the bundled default icon otherwise.
   */
  app_icon_url: string;
}

export function AppIconUrlProvider({
  app_icon_url,
  children,
}: AppIconUrlProviderProps): ReactElement {
  return (
    <AppIconUrlContext.Provider value={app_icon_url}>
      {children}
    </AppIconUrlContext.Provider>
  );
}

export function useAppIconUrl(): string {
  const app_icon_url: string | null = useContext(AppIconUrlContext);
  if (typeof app_icon_url !== "string") {
    throw new Error(
      "useAppIconUrl() must be used within an <AppIconUrlProvider />",
    );
  }
  return app_icon_url;
}

export default AppIconUrlProvider;
