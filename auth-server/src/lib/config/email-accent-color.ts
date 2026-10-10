import "server-only";
import { getThemeToken, themeTokenDefault } from "@schemavaults/theme/tokens";
import getAuthServerThemeColors from "@/lib/config/auth-server-theme-colors";
import { DEFAULT_AUTH_SERVER_THEME_COLOR_1 } from "@/lib/config/default-auth-server-theme-colors";

/**
 * The light-mode value of schemavaults-brand-blue: the default
 * SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1 is a CSS variable, which email
 * clients cannot resolve.
 */
export const DEFAULT_EMAIL_ACCENT_COLOR: string =
  themeTokenDefault(getThemeToken("brand-blue"), "light") ?? "#60a5fa";

/**
 * A hex color, a named color or a color function of literal values. Leaves out
 * CSS variables (no stylesheet to resolve them in an email) and anything that
 * could break out of the `style` attribute the color is written into.
 */
const INLINE_CSS_COLOR: RegExp =
  /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|[a-z]+|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([\w\s.,%/+-]*\))$/i;

/** Whether `color` renders when inlined into an email's `style` attributes. */
export function isInlineCssColor(color: string): boolean {
  return INLINE_CSS_COLOR.test(color);
}

/**
 * @description The accent color (header, section headings, links) of the
 * HTML email this deployment sends, e.g. the daily admin report: the
 * deployment's first theme color, SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1, so
 * a white-label deployment's email matches its UI. When the variable is unset
 * the accent is the default theme's schemavaults-brand-blue. Email clients
 * have no stylesheet, so a value they cannot render (e.g. "var(--my-color)")
 * also falls back to it, with a warning: set a literal color such as "#7c3aed"
 * to brand the email.
 */
export function getAuthServerEmailAccentColor(): string {
  const [color_1] = getAuthServerThemeColors();
  if (color_1 === DEFAULT_AUTH_SERVER_THEME_COLOR_1) {
    return DEFAULT_EMAIL_ACCENT_COLOR;
  }
  if (isInlineCssColor(color_1)) {
    return color_1;
  }
  console.warn(
    `[getAuthServerEmailAccentColor] SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1 ("${color_1}") cannot be inlined into email; using ${DEFAULT_EMAIL_ACCENT_COLOR} instead. Set it to a literal color (e.g. "#7c3aed") to brand the daily admin report.`,
  );
  return DEFAULT_EMAIL_ACCENT_COLOR;
}

export default getAuthServerEmailAccentColor;
