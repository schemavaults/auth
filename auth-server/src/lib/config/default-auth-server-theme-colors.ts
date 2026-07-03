// Shared (server & client) fallbacks for SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1
// and SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2. Lives in its own directive-free
// module so both the server-only getter and client components can import it.
import { getSchemaVaultsBrandColor } from "@schemavaults/theme/brand_colors";

/**
 * @description [from, to] CSS color strings for the auth server's theme
 * gradients (page container background & <Wordmark /> text).
 */
export type AuthServerThemeColors = [from: string, to: string];

export const DEFAULT_AUTH_SERVER_THEME_COLOR_1: string =
  getSchemaVaultsBrandColor("schemavaults-brand-blue");

export const DEFAULT_AUTH_SERVER_THEME_COLOR_2: string =
  getSchemaVaultsBrandColor("schemavaults-brand-red");

export const DEFAULT_AUTH_SERVER_THEME_COLORS: AuthServerThemeColors = [
  DEFAULT_AUTH_SERVER_THEME_COLOR_1,
  DEFAULT_AUTH_SERVER_THEME_COLOR_2,
];

export default DEFAULT_AUTH_SERVER_THEME_COLORS;
