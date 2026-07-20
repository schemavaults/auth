"use client";

import type { ReactElement } from "react";
import {
  ErrorPage as UiErrorPage,
  type ErrorPageProps as UiErrorPageProps,
} from "@schemavaults/ui";
import { useAuthServerFriendlyName } from "@/components/Wordmark";
import { useAuthServerThemeColors } from "@/components/ThemeColors";

export type ErrorPageProps = UiErrorPageProps;

/**
 * @description Auth-server wrapper around the @schemavaults/ui <ErrorPage />
 * that threads the deployment's friendly name (from the
 * SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME environment variable) and theme
 * gradient colors (from the SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1 and
 * SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2 environment variables) into the error
 * page's <Wordmark /> via `wordmarkProps`, enabling white-label deployments.
 * Reads the values from the root layout's context providers, so it falls back
 * to the default "SchemaVaults" branding when rendered outside of them (an
 * explicit `wordmarkProps` prop always wins over the context values).
 */
export function ErrorPage(props: ErrorPageProps): ReactElement {
  const friendly_name: string = useAuthServerFriendlyName();
  const theme_colors = useAuthServerThemeColors();
  return (
    <UiErrorPage
      {...props}
      wordmarkProps={{
        wordmarkText: friendly_name,
        gradientColors: theme_colors,
        ...props.wordmarkProps,
      }}
    />
  );
}

export default ErrorPage;
