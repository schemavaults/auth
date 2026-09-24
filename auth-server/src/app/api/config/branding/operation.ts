import { z, publicAccess } from "@schemavaults/openapi-operations";
import { defineOperation } from "@/lib/api/context";
import { API_TAGS } from "@/lib/api/tags";
import getAuthServerFriendlyName from "@/lib/config/auth-server-friendly-name";
import getAuthServerThemeColors from "@/lib/config/auth-server-theme-colors";

/** `AuthServerBrandingConfig` as consumed by the global error page (`src/app/global-error.tsx`). */
export const AuthServerBrandingConfig = z
  .object({
    friendly_name: z.string().openapi({
      description: "Human-friendly name of this deployment (`SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME`)",
      example: "SchemaVaults",
    }),
    theme_colors: z
      .tuple([
        z.string().openapi({ description: "Gradient start (`SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1`)" }),
        z.string().openapi({ description: "Gradient end (`SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_2`)" }),
      ])
      .openapi({
        description: "[from, to] CSS color strings of the theme gradient (page background, wordmark)",
        example: ["#1e40af", "#b91c1c"],
      }),
  })
  .openapi("AuthServerBrandingConfig");

/**
 * Public, unauthenticated endpoint exposing the white-label text/color
 * branding for this auth server deployment (the friendly name and [from,
 * to] theme gradient colors resolved from the
 * SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME and
 * SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1/2 environment variables). Consumed
 * by client components that render outside the root layout's context
 * providers — e.g. the global error page, which replaces the root layout
 * entirely and so cannot read the friendly-name/theme-colors contexts.
 * Intentionally reads only environment variables (no database/Redis: the
 * request context opens them lazily and this handler never touches them)
 * so it stays available when the rest of the server is failing.
 */
export const getBrandingConfig = defineOperation({
  method: "get",
  path: "/api/config/branding",
  summary: "White-label branding",
  description:
    "The deployment's friendly name and theme gradient colors, resolved from the `SCHEMAVAULTS_AUTH_SERVER_FRIENDLY_NAME` / `SCHEMAVAULTS_AUTH_SERVER_THEME_COLOR_1|2` environment variables. Public. Reads no database or cache, so it keeps answering while the rest of the server is failing; the global error page uses it to stay on-brand.",
  tags: [API_TAGS.configuration],
  auth: publicAccess(),
  responses: {
    200: {
      description: "The branding configuration",
      schema: z
        .object({
          error: z.literal(false),
          success: z.literal(true),
          message: z.string(),
          data: AuthServerBrandingConfig,
        })
        .openapi("BrandingConfigResponse"),
    },
  },
  handler: (ctx) =>
    ctx.json(200, {
      error: false,
      success: true,
      message: "Successfully loaded server branding config!",
      data: {
        friendly_name: getAuthServerFriendlyName(),
        theme_colors: getAuthServerThemeColors(),
      },
    }),
});
