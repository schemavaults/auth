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
