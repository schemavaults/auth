import { createContext } from "react";
import type { IAuthProviderRedirectUrlConfigurationWithDefaultsSet } from "@/types/IAuthProviderRedirectUrlConfiguration";

export const RedirectUrlConfigurationContext =
  createContext<IAuthProviderRedirectUrlConfigurationWithDefaultsSet | null>(
    null,
  );

export default RedirectUrlConfigurationContext;
