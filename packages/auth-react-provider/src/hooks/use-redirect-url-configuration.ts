"use client";

import RedirectUrlConfigurationContext from "@/contexts/redirect-url-configuration-context";
import type { IAuthProviderRedirectUrlConfigurationWithDefaultsSet } from "@/types/IAuthProviderRedirectUrlConfiguration";
import { useContext } from "react";

export function useRedirectUrlConfiguration(): IAuthProviderRedirectUrlConfigurationWithDefaultsSet {
  const context: IAuthProviderRedirectUrlConfigurationWithDefaultsSet | null =
    useContext(RedirectUrlConfigurationContext);
  if (!context) {
    throw new Error(
      "Failed to load redirect URL configuration from context!" +
        " " +
        "Is this hook being called from within a <RedirectUrlConfigurationContext.Provider> render tree (i.e. within a <SchemaVaultsAuthProvider>)?",
    );
  }
  return context satisfies IAuthProviderRedirectUrlConfigurationWithDefaultsSet;
}

export default useRedirectUrlConfiguration;
