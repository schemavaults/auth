"use client";

import type { ReactElement } from "react";
import {
  ThemedPageBackground as UiThemedPageBackground,
  type ThemedPageBackgroundProps,
} from "@schemavaults/ui";
import { useAuthServerThemeColors } from "@/components/ThemeColors";

export type { ThemedPageBackgroundProps };

/**
 * @description Auth-server wrapper around the @schemavaults/ui
 * <ThemedPageBackground /> that defaults the background gradient to the
 * deployment's theme colors (from the SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1
 * and SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2 environment variables) instead of
 * the package's built-in defaults, enabling white-label deployments.
 */
export function ThemedPageBackground(
  props: ThemedPageBackgroundProps,
): ReactElement {
  const theme_colors = useAuthServerThemeColors();
  return <UiThemedPageBackground gradientColors={theme_colors} {...props} />;
}

export default ThemedPageBackground;
