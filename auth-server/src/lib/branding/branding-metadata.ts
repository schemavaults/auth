import "server-only";

import { getAuthServerUrl } from "@schemavaults/app-definitions";
import ServerlessDatabase from "@/lib/auth-db/serverless-database";
import { RedisCache } from "@/lib/redis";
import {
  BrandingAssetsRegistry,
  type BrandingAssetKey,
} from "@/lib/auth-db/branding";
import { getDefaultBrandingAsset } from "@/lib/branding/default-assets";
import { brandingAssetUrlPath } from "@/lib/branding/branding-asset-version";
import { getGeneratedOpenGraphImageHash } from "@/lib/branding/generated-og-image";

/**
 * Resolved /branding/* asset URLs (with ?v= cache-busting versions) for the
 * root layout's generateMetadata().
 */
export interface ResolvedBrandingMetadata {
  /** Base URL for resolving relative metadata URLs to absolute ones (og:image crawlers require absolute URLs). Null when the deployment URL cannot be resolved (e.g. at build time). */
  metadataBase: URL | null;
  faviconUrl: string;
  iconUrl: string;
  opengraphImageUrl: string;
  /** True when the opengraph image is generated from the branding config (its 1200x630 dimensions are then known) rather than administrator-uploaded. */
  opengraphImageIsGenerated: boolean;
}

/**
 * Version hash of a bundled default asset, for cache-busting metadata URLs.
 * Page metadata must never crash on a missing/unreadable default file, so
 * failures degrade to a bare (unversioned, short-TTL cached) asset URL.
 */
async function safeDefaultAssetHash(key: string): Promise<string | null> {
  try {
    const default_asset = await getDefaultBrandingAsset(key);
    return default_asset?.contentHash ?? null;
  } catch (e: unknown) {
    console.error(
      `[resolveBrandingMetadata] Failed to load default branding asset "${key}":`,
      e,
    );
    return null;
  }
}

/**
 * Load the current asset content hashes (Redis-cached, ~1 lookup per TTL).
 * Degrades gracefully when the database is unreachable (e.g. during
 * `next build`): callers fall back to the default assets' versions, and the
 * short-TTL caching on the serving route self-corrects the mismatch.
 */
async function safeLoadAssetVersions(): Promise<
  Partial<Record<BrandingAssetKey, string | null>>
> {
  try {
    await using dbh = ServerlessDatabase.createDBH();
    await using redis = RedisCache.createConnection();
    const registry = new BrandingAssetsRegistry(
      dbh.db,
      undefined,
      redis.client,
    );
    return await registry.getAssetVersions();
  } catch (e: unknown) {
    console.error(
      "[resolveBrandingMetadata] Failed to load branding asset versions, using defaults:",
      e,
    );
    return {};
  }
}

/**
 * Resolve the cache-busted /branding/icon URL for rendering the app icon in
 * page content (e.g. the dashboard layout logo and the home page), matching
 * the URL generateMetadata() links in the document head.
 */
export async function resolveBrandingIconUrl(): Promise<string> {
  const versions = await safeLoadAssetVersions();
  const iconHash: string | null =
    versions.icon ?? (await safeDefaultAssetHash("icon"));
  return brandingAssetUrlPath("icon", iconHash);
}

/**
 * Resolve the branding asset URLs for page metadata, cache-busted whenever an
 * administrator uploads new branding.
 */
export async function resolveBrandingMetadata(): Promise<ResolvedBrandingMetadata> {
  const versions = await safeLoadAssetVersions();

  let metadataBase: URL | null = null;
  try {
    metadataBase = new URL(getAuthServerUrl());
  } catch (e: unknown) {
    console.error(
      "[resolveBrandingMetadata] Failed to resolve auth server URL for metadataBase:",
      e,
    );
  }

  const faviconHash: string | null =
    versions.favicon ?? (await safeDefaultAssetHash("favicon"));
  const iconHash: string | null =
    versions.icon ?? (await safeDefaultAssetHash("icon"));
  const opengraphImageIsGenerated: boolean =
    typeof versions["opengraph-image"] !== "string";
  const opengraphImageHash: string =
    versions["opengraph-image"] ?? getGeneratedOpenGraphImageHash();

  return {
    metadataBase,
    faviconUrl: brandingAssetUrlPath("favicon", faviconHash),
    iconUrl: brandingAssetUrlPath("icon", iconHash),
    opengraphImageUrl: brandingAssetUrlPath(
      "opengraph-image",
      opengraphImageHash,
    ),
    opengraphImageIsGenerated,
  };
}
