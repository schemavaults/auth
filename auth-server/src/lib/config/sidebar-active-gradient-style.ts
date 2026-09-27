import type { CSSProperties } from "react";
import { themeOverrideVariable } from "@schemavaults/theme/tokens";
import type { AuthServerThemeColors } from "@/lib/config/default-auth-server-theme-colors";

/**
 * @description Style for the root `<html>` element that points the
 * @schemavaults/theme sidebar active-item gradient (`--sidebar-active-start`
 * → `--sidebar-active-end`, which the DashboardLayout paints on the sidebar
 * link for the current page) at this deployment's theme colors, so
 * white-label deployments get a sidebar gradient matching their <Wordmark />
 * and page backgrounds. Both tokens default to the same brand blue and red as
 * the theme colors, so this changes nothing unless
 * SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1/2 are set.
 *
 * Goes through the theme's override variables on `<html>` (for light and dark
 * mode) rather than setting the tokens on the layout, so that it also reaches
 * the mobile sidebar, which renders in a portal outside the layout.
 */
export function createSidebarActiveGradientStyle([
  color_1,
  color_2,
]: AuthServerThemeColors): CSSProperties {
  return {
    [themeOverrideVariable("sidebar-active-start", "light")]: color_1,
    [themeOverrideVariable("sidebar-active-start", "dark")]: color_1,
    [themeOverrideVariable("sidebar-active-end", "light")]: color_2,
    [themeOverrideVariable("sidebar-active-end", "dark")]: color_2,
  } as CSSProperties;
}

export default createSidebarActiveGradientStyle;
