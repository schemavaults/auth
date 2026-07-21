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
      "Large square icon used for apple-touch-icon and app shortcuts, and rendered as the logo in the dashboard layout and on the home page. Served at /branding/icon.",
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
 * File extensions for each allowed branding-asset MIME type. OS file pickers
 * translate MIME types in an <input accept="..."> to extensions via platform
 * registries, which is unreliable for .ico (image/x-icon and
 * image/vnd.microsoft.icon frequently have no mapping), so accept attributes
 * must list the extensions explicitly alongside the MIME types.
 */
const FILE_EXTENSIONS_BY_CONTENT_TYPE: Record<string, readonly string[]> = {
  "image/x-icon": [".ico"],
  "image/vnd.microsoft.icon": [".ico"],
  "image/png": [".png"],
  "image/svg+xml": [".svg"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
};

/**
 * Build the <input accept="..."> value for a branding asset slot: the allowed
 * MIME types plus their file extensions, so files stay selectable in pickers
 * that can't map a MIME type to an extension.
 */
export function buildBrandingAssetAcceptAttribute(
  allowedContentTypes: readonly string[],
): string {
  const parts: string[] = [...allowedContentTypes];
  for (const contentType of allowedContentTypes) {
    for (const extension of FILE_EXTENSIONS_BY_CONTENT_TYPE[contentType] ??
      []) {
      if (!parts.includes(extension)) {
        parts.push(extension);
      }
    }
  }
  return parts.join(",");
}

/**
 * Resolve the MIME type to use when uploading a selected file to a branding
 * asset slot. Browsers populate File.type from OS registries, which is
 * unreliable for .ico files (often "" or a nonstandard value like
 * "image/ico"), so when the reported type is not an allowed MIME type, fall
 * back to matching the filename extension against the slot's allowed types.
 * Returns null when the file matches neither.
 */
export function resolveBrandingAssetUploadContentType(
  file: { readonly name: string; readonly type: string },
  allowedContentTypes: readonly string[],
): string | null {
  const reportedType: string = file.type.trim().toLowerCase();
  if (reportedType && allowedContentTypes.includes(reportedType)) {
    return reportedType;
  }
  const filename: string = file.name.toLowerCase();
  for (const contentType of allowedContentTypes) {
    const extensions = FILE_EXTENSIONS_BY_CONTENT_TYPE[contentType] ?? [];
    if (extensions.some((extension) => filename.endsWith(extension))) {
      return contentType;
    }
  }
  return null;
}

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
