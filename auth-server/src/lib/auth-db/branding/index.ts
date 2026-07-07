// Server-only exports - these will cause errors if imported in client components
// Import these directly when in server context
export {
  BrandingAssetsRegistry,
  BrandingAssetTooLargeError,
  BrandingAssetInvalidContentTypeError,
} from "./branding-assets-registry";

// Shared exports - safe to import anywhere (no server-only dependency)
export {
  BRANDING_ASSET_DEFINITIONS,
  isValidBrandingAssetKey,
  getAllBrandingAssetKeys,
  getBrandingAssetDefinition,
} from "./branding-asset-keys";
export type {
  BrandingAssetKey,
  BrandingAssetDefinition,
} from "./branding-asset-keys";

export type * from "./branding-assets-table";
export type {
  BrandingAssetContent,
  BrandingAssetMetadataRecord,
} from "./types";
