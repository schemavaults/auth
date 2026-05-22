"use client";

import RedirectUrlConfigurationContext from "@/contexts/redirect-url-configuration-context";
import createRedirectUrlConfigurationWithDefaultsSet from "@/lib/createRedirectUrlConfigurationWithDefaults";
import type { IAuthProviderRedirectUrlConfiguration } from "@/types/IAuthProviderRedirectUrlConfiguration";
import { useMemo, type PropsWithChildren, type ReactElement } from "react";

export interface RedirectUrlConfigurationProviderProps extends PropsWithChildren<IAuthProviderRedirectUrlConfiguration> {}

export default function RedirectUrlConfigurationProvider({
  children,
  login_uri,
  register_uri,
  successful_authentication_redirect_uri,
  successful_logout_redirect_uri,
  authed_on_unauthed_redirect_uri,
  unauthed_on_authed_redirect_uri,
  authorize_uri,
  error_page_uri,
}: RedirectUrlConfigurationProviderProps): ReactElement {
  const configuration = useMemo(
    () =>
      createRedirectUrlConfigurationWithDefaultsSet({
        login_uri,
        register_uri,
        successful_authentication_redirect_uri,
        successful_logout_redirect_uri,
        authed_on_unauthed_redirect_uri,
        unauthed_on_authed_redirect_uri,
        authorize_uri,
        error_page_uri,
      } satisfies IAuthProviderRedirectUrlConfiguration),
    [
      login_uri,
      register_uri,
      successful_authentication_redirect_uri,
      successful_logout_redirect_uri,
      authed_on_unauthed_redirect_uri,
      unauthed_on_authed_redirect_uri,
      authorize_uri,
      error_page_uri,
    ],
  );

  return (
    <RedirectUrlConfigurationContext.Provider value={configuration}>
      {children}
    </RedirectUrlConfigurationContext.Provider>
  );
}
