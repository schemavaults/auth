"use client";

import { createContext, useContext } from "react";
import type { PropsWithChildren, ReactElement } from "react";
import {
  DEFAULT_AUTH_SERVER_THEME_COLORS,
  type AuthServerThemeColors,
} from "@/lib/config/default-auth-server-theme-colors";

const AuthServerThemeColorsContext = createContext<AuthServerThemeColors>(
  DEFAULT_AUTH_SERVER_THEME_COLORS,
);

export interface AuthServerThemeColorsProviderProps extends PropsWithChildren {
  /**
   * @description Server-resolved [SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1,
   * SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2] values
   */
  theme_colors: AuthServerThemeColors;
}

export function AuthServerThemeColorsProvider({
  theme_colors,
  children,
}: AuthServerThemeColorsProviderProps): ReactElement {
  return (
    <AuthServerThemeColorsContext.Provider value={theme_colors}>
      {children}
    </AuthServerThemeColorsContext.Provider>
  );
}

export function useAuthServerThemeColors(): AuthServerThemeColors {
  return useContext(AuthServerThemeColorsContext);
}

export default AuthServerThemeColorsProvider;
