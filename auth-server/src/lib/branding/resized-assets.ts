import "server-only";

import sharp from "sharp";
import type Redis from "ioredis";
import type { BrandingAssetContent } from "@/lib/auth-db/branding";
import type { DefaultBrandingAsset } from "@/lib/branding/default-assets";
import type { BrandingAssetResizeSize } from "@/lib/branding/branding-asset-version";

/**
 * Raster content types the ?s= resize parameter supports. Other branding
 * content types (ICO, SVG) are always served at their original size.
 */
const RESIZABLE_CONTENT_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
];

export function isResizableBrandingContentType(contentType: string): boolean {
  return RESIZABLE_CONTENT_TYPES.includes(contentType);
}

/**
 * Downscale an asset to fit within size x size, preserving aspect ratio and
 * never enlarging. sharp keeps the input format for toBuffer() when no
 * output format is selected, so the caller's content type stays accurate.
 */
async function resizeBrandingAssetBytes(
  bytes: Buffer,
  size: BrandingAssetResizeSize,
): Promise<Buffer> {
  return await sharp(bytes)
    .resize(size, size, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
}

// Resized variants are content-addressed (the source content hash is in the
// cache key), so the TTL only bounds Redis memory usage.
const RESIZED_CACHE_TTL_SECONDS = 3600;

function redisResizedKey(
  assetKey: string,
  contentHash: string,
  size: BrandingAssetResizeSize,
): string {
  return `branding_asset_resized:${assetKey}:${contentHash}:${size}`;
}

/**
 * Resize an administrator-uploaded branding asset, caching the result in
 * Redis. Returns null when the content type is not resizable or the resize
 * fails — callers must fall back to serving the original bytes.
 */
export async function getResizedCustomBrandingAsset(
  content: BrandingAssetContent,
  size: BrandingAssetResizeSize,
  redis?: Redis,
): Promise<Buffer | null> {
  if (!isResizableBrandingContentType(content.contentType)) {
    return null;
  }

  const cacheKey = redisResizedKey(content.key, content.contentHash, size);
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        return Buffer.from(cached, "base64");
      }
    } catch (e: unknown) {
      console.error(
        `[resized-assets] Redis cache read failed for "${cacheKey}", resizing directly:`,
        e,
      );
    }
  }

  let resized: Buffer;
  try {
    resized = await resizeBrandingAssetBytes(
      Buffer.from(content.contentBase64, "base64"),
      size,
    );
  } catch (e: unknown) {
    console.error(
      `[resized-assets] Failed to resize custom branding asset "${content.key}" to ${size}px:`,
      e,
    );
    return null;
  }

  if (redis) {
    try {
      await redis.set(
        cacheKey,
        resized.toString("base64"),
        "EX",
        RESIZED_CACHE_TTL_SECONDS,
      );
    } catch (e: unknown) {
      console.error(
        `[resized-assets] Failed to populate Redis cache for "${cacheKey}":`,
        e,
      );
    }
  }

  return resized;
}

// Bundled default assets are immutable within a deployment, so their resized
// variants are cached in-process (mirroring default-assets/index.ts).
const resizedDefaults = new Map<string, Buffer>();

/**
 * Resize a bundled default branding asset, caching the result in-process.
 * Returns null when the content type is not resizable or the resize fails —
 * callers must fall back to serving the original bytes.
 */
export async function getResizedDefaultBrandingAsset(
  assetKey: string,
  asset: DefaultBrandingAsset,
  size: BrandingAssetResizeSize,
): Promise<Buffer | null> {
  if (!isResizableBrandingContentType(asset.contentType)) {
    return null;
  }

  const cacheKey = `${assetKey}:${asset.contentHash}:${size}`;
  const cached = resizedDefaults.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const resized = await resizeBrandingAssetBytes(asset.bytes, size);
    resizedDefaults.set(cacheKey, resized);
    return resized;
  } catch (e: unknown) {
    console.error(
      `[resized-assets] Failed to resize default branding asset "${assetKey}" to ${size}px:`,
      e,
    );
    return null;
  }
}
