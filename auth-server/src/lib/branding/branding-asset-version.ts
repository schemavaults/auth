// Directive-free helper (safe in client & server code) for building the
// ?v= cache-busting version parameter appended to /branding/* asset URLs.

/**
 * Shorten a branding asset's SHA-256 content hash into the ?v= version
 * parameter used to cache-bust /branding/* URLs. The serving route treats a
 * request whose ?v= matches the current content hash as immutable.
 */
export function brandingAssetVersionParam(contentHash: string): string {
  return contentHash.slice(0, 16);
}

/**
 * Build the public URL path for a branding asset, with a cache-busting ?v=
 * version parameter when the asset's content hash is known.
 */
export function brandingAssetUrlPath(
  assetKey: string,
  contentHash?: string | null,
): string {
  const base = `/branding/${assetKey}`;
  if (typeof contentHash === "string" && contentHash.length > 0) {
    return `${base}?v=${brandingAssetVersionParam(contentHash)}`;
  }
  return base;
}

/**
 * Allowed values for the ?s= square-resize parameter on /branding/* asset
 * URLs. A bounded allowlist keeps the set of servable variants (and the
 * server-side resize work) finite — a free-form width/height param would let
 * anyone mint unbounded distinct cacheable URLs.
 */
export const BRANDING_ASSET_RESIZE_SIZES = [64, 128, 256] as const;

export type BrandingAssetResizeSize =
  (typeof BRANDING_ASSET_RESIZE_SIZES)[number];

export function isBrandingAssetResizeSize(
  value: number,
): value is BrandingAssetResizeSize {
  return (BRANDING_ASSET_RESIZE_SIZES as readonly number[]).includes(value);
}

/**
 * Pick the smallest allowed resize size that covers a display dimension in
 * physical pixels, falling back to the largest allowed size.
 */
export function pickBrandingAssetResizeSize(
  displayPx: number,
): BrandingAssetResizeSize {
  let largest: BrandingAssetResizeSize = BRANDING_ASSET_RESIZE_SIZES[0];
  for (const size of BRANDING_ASSET_RESIZE_SIZES) {
    if (size >= displayPx) {
      return size;
    }
    largest = size;
  }
  return largest;
}

/**
 * Append the ?s= resize parameter to a branding asset URL (which may already
 * carry a ?v= cache-busting version).
 */
export function brandingAssetSizedUrl(
  assetUrl: string,
  size: BrandingAssetResizeSize,
): string {
  return `${assetUrl}${assetUrl.includes("?") ? "&" : "?"}s=${size}`;
}
