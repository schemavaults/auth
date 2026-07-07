// Types-only file - safe to import from client components
// This file must NOT have any runtime dependencies on server-only code

export type {
  ServerBrandingAssetsTable,
  ServerBrandingAssetRow,
  NewServerBrandingAssetRow,
  ServerBrandingAssetRowUpdate,
} from "./branding-assets-table";

export type {
  BrandingAssetKey,
  BrandingAssetDefinition,
} from "./branding-asset-keys";

/**
 * A branding asset's content as loaded from the database.
 */
export interface BrandingAssetContent {
  key: string;
  /** Raw image bytes, base64-encoded (as stored) */
  contentBase64: string;
  contentType: string;
  /** SHA-256 hex digest of the raw image bytes */
  contentHash: string;
  sizeBytes: number;
  updatedAt: number;
}

/**
 * Metadata describing the state of a branding asset slot (without content),
 * as returned by the admin API for every known asset key.
 */
export interface BrandingAssetMetadataRecord {
  key: string;
  label: string;
  description: string;
  allowedContentTypes: readonly string[];
  maxSizeBytes: number;
  recommendedDimensions: string;
  /** Whether an administrator has uploaded a custom asset for this slot */
  hasCustomAsset: boolean;
  contentType: string | null;
  /** SHA-256 hex digest of the uploaded bytes (null when using the default) */
  contentHash: string | null;
  sizeBytes: number | null;
  updatedAt: number | null;
  updatedBy: string | null;
}
