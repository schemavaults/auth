import "server-only";
import maybeStripQuotes from "@/lib/maybeStripQuotes";
import {
  DEFAULT_AUTH_SERVER_THEME_COLOR_1,
  DEFAULT_AUTH_SERVER_THEME_COLOR_2,
  type AuthServerThemeColors,
} from "@/lib/config/default-auth-server-theme-colors";

/**
 * @description Resolves the [from, to] theme gradient colors for this auth
 * server deployment from the SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1 and
 * SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2 environment variables. These colors
 * configure the page container background gradient and the <Wordmark /> text
 * gradient, so white-label deployments can rebrand the color scheme. Any CSS
 * color string works (e.g. "#0f172a", "rgb(15 23 42)", "var(--my-color)").
 * Defaults to the schemavaults-brand-blue and schemavaults-brand-red colors
 * from @schemavaults/theme when unset.
 */
export function getAuthServerThemeColors(): AuthServerThemeColors {
  const color_1: string | undefined = maybeStripQuotes(
    process.env.SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1,
  );
  const color_2: string | undefined = maybeStripQuotes(
    process.env.SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2,
  );
  return [
    typeof color_1 === "string" && color_1.length > 0
      ? color_1
      : DEFAULT_AUTH_SERVER_THEME_COLOR_1,
    typeof color_2 === "string" && color_2.length > 0
      ? color_2
      : DEFAULT_AUTH_SERVER_THEME_COLOR_2,
  ];
}

export default getAuthServerThemeColors;
