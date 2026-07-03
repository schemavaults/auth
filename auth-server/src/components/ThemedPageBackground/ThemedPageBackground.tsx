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
 * the package's built-in defaults, enabling white-label deployments. The
 * colors are inverted ([color 2, color 1]) so page backgrounds keep the
 * package's original color direction while the <Wordmark /> uses [1, 2].
 */
export function ThemedPageBackground(
  props: ThemedPageBackgroundProps,
): ReactElement {
  const [color_1, color_2] = useAuthServerThemeColors();
  return (
    <UiThemedPageBackground gradientColors={[color_2, color_1]} {...props} />
  );
}

export default ThemedPageBackground;
