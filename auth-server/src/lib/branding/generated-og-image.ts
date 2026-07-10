import "server-only";

import { createHash } from "node:crypto";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import getAuthServerDescription from "@/lib/config/auth-server-description";
import getAuthServerThemeColors from "@/lib/config/auth-server-theme-colors";
import {
  DEFAULT_AUTH_SERVER_THEME_COLOR_1,
  DEFAULT_AUTH_SERVER_THEME_COLOR_2,
  type AuthServerThemeColors,
} from "@/lib/config/default-auth-server-theme-colors";

export const GENERATED_OPENGRAPH_IMAGE_WIDTH = 1200;
export const GENERATED_OPENGRAPH_IMAGE_HEIGHT = 630;

/**
 * Bump this when the generated opengraph image design changes, so that
 * previously cached copies (keyed by the content hash below) are busted.
 */
export const GENERATED_OPENGRAPH_IMAGE_DESIGN_VERSION = "v1";

/**
 * The white-label branding inputs that the generated opengraph image is
 * derived from.
 */
export interface OpenGraphImageBranding {
  friendlyName: string;
  description: string;
  themeColors: AuthServerThemeColors;
}

/**
 * The theme color env vars accept any CSS color string, including CSS
 * variables (e.g. "var(--my-color)") that only resolve inside the app's
 * stylesheets. Those cannot resolve in a standalone rendered image, so fall
 * back to the default brand colors for the opengraph image in that case.
 */
function sanitizeThemeColorForImage(color: string, fallback: string): string {
  if (color.includes("var(")) {
    return fallback;
  }
  return color;
}

/**
 * Resolve the deployment's white-label branding config (friendly name,
 * description, theme colors) used to generate the default opengraph image.
 */
export function resolveOpenGraphImageBranding(): OpenGraphImageBranding {
  const [color_1, color_2] = getAuthServerThemeColors();
  return {
    friendlyName: getAuthServerFriendlyName(),
    description: getAuthServerDescription(),
    themeColors: [
      sanitizeThemeColorForImage(color_1, DEFAULT_AUTH_SERVER_THEME_COLOR_1),
      sanitizeThemeColorForImage(color_2, DEFAULT_AUTH_SERVER_THEME_COLOR_2),
    ],
  };
}

/**
 * Stable content hash for the generated opengraph image, derived from the
 * branding inputs. Used as the ETag and the ?v= cache-busting version so
 * caches invalidate when the deployment is rebranded.
 */
export function getGeneratedOpenGraphImageHash(
  branding: OpenGraphImageBranding = resolveOpenGraphImageBranding(),
): string {
  const seed = [
    `generated-og:${GENERATED_OPENGRAPH_IMAGE_DESIGN_VERSION}`,
    branding.friendlyName,
    branding.description,
    branding.themeColors[0],
    branding.themeColors[1],
  ].join("|");
  return createHash("sha256").update(seed).digest("hex");
}
