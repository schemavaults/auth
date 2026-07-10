"use client";

import type { ReactElement } from "react";
import {
  Wordmark as UiWordmark,
  type WordmarkProps as UiWordmarkProps,
} from "@schemavaults/ui";
import { useAuthServerFriendlyName } from "./AuthServerFriendlyNameProvider";
import { useAuthServerThemeColors } from "@/components/ThemeColors";

export type WordmarkProps = Omit<UiWordmarkProps, "wordmarkText">;

/**
 * @description Auth-server wrapper around the @schemavaults/ui <Wordmark />
 * that renders the deployment's friendly name (from the
 * SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME environment variable) with the
 * deployment's theme gradient colors (from the
 * SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1 and
 * SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2 environment variables) instead of the
 * package's built-in defaults, enabling white-label deployments.
 */
export function Wordmark(props: WordmarkProps): ReactElement {
  const friendly_name: string = useAuthServerFriendlyName();
  const theme_colors = useAuthServerThemeColors();
  return (
    <UiWordmark
      gradientColors={theme_colors}
      {...props}
      wordmarkText={friendly_name}
    />
  );
}

export default Wordmark;
