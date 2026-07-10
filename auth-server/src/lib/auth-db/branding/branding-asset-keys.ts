// Registry of the white-label branding assets administrators can customize.
// This module is directive-free (no "server-only") so client components can
// import the definitions for upload validation, accept attributes, and labels.

/**
 * Definition of a customizable branding asset slot.
 */
export interface BrandingAssetDefinition {
  /** Human-friendly label shown in the admin UI */
  label: string;
  /** Description of where/how the asset is used */
  description: string;
  /** MIME types accepted for upload (also used for <input accept="..."/>) */
  allowedContentTypes: readonly string[];
  /** Maximum upload size, in raw (pre-base64) bytes */
  maxSizeBytes: number;
  /** Recommended pixel dimensions, for display in the admin UI */
  recommendedDimensions: string;
}

/**
 * Registry of all branding asset slots with their upload constraints.
 * Add new assets here to maintain type safety across the codebase.
 * Keys double as the public URL segment: /branding/<asset_key>
 */
export const BRANDING_ASSET_DEFINITIONS = {
  favicon: {
    label: "Favicon",
    description:
      "Icon shown in browser tabs and bookmarks. Served at /branding/favicon (and rewritten from /favicon.ico).",
    allowedContentTypes: [
      "image/x-icon",
      "image/vnd.microsoft.icon",
      "image/png",
      "image/svg+xml",
    ],
    maxSizeBytes: 512 * 1024,
    recommendedDimensions: "32x32 or 48x48",
  },
  icon: {
    label: "App Icon",
    description:
      "Large square icon used for apple-touch-icon and app shortcuts. Served at /branding/icon.",
    allowedContentTypes: ["image/png"],
    maxSizeBytes: 1024 * 1024,
    recommendedDimensions: "512x512",
  },
  "opengraph-image": {
    label: "OpenGraph Image",
    description:
      "Social sharing preview image used by the og:image and twitter:image meta tags. When no custom image is uploaded, a branded image is generated from the deployment's friendly name, description, and theme colors. Served at /branding/opengraph-image.",
    allowedContentTypes: ["image/png", "image/jpeg", "image/webp"],
    maxSizeBytes: 2 * 1024 * 1024,
    recommendedDimensions: "1200x630",
  },
} as const satisfies Record<string, BrandingAssetDefinition>;

/**
 * Union type of all valid branding asset keys
 */
export type BrandingAssetKey = keyof typeof BRANDING_ASSET_DEFINITIONS;

/**
 * Check if a key is a valid branding asset key
 */
export function isValidBrandingAssetKey(
  key: string,
): key is BrandingAssetKey {
  return key in BRANDING_ASSET_DEFINITIONS;
}

/**
 * Get all known branding asset keys
 */
export function getAllBrandingAssetKeys(): readonly BrandingAssetKey[] {
  return Object.keys(BRANDING_ASSET_DEFINITIONS) as BrandingAssetKey[];
}

/**
 * Type-safe helper to get the definition for a branding asset
 */
export function getBrandingAssetDefinition(
  key: BrandingAssetKey,
): BrandingAssetDefinition {
  return BRANDING_ASSET_DEFINITIONS[key];
}
