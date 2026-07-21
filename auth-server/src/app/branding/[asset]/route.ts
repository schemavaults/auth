import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import type { ServerRuntime } from "next/types";
import ServerlessDatabase from "@/lib/auth-db/serverless-database";
import { RedisCache } from "@/lib/redis";
import {
  BrandingAssetsRegistry,
  isValidBrandingAssetKey,
  type BrandingAssetContent,
} from "@/lib/auth-db/branding";
import { getDefaultBrandingAsset } from "@/lib/branding/default-assets";
import {
  brandingAssetVersionParam,
  isBrandingAssetResizeSize,
  type BrandingAssetResizeSize,
} from "@/lib/branding/branding-asset-version";
import {
  getResizedCustomBrandingAsset,
  getResizedDefaultBrandingAsset,
} from "@/lib/branding/resized-assets";
import {
  getGeneratedOpenGraphImageHash,
  resolveOpenGraphImageBranding,
} from "@/lib/branding/generated-og-image";
import { generatedOpenGraphImageResponse } from "./generated-og-image-response";

/**
 * Public, unauthenticated route serving the deployment's branding assets
 * (favicon, app icon, opengraph image) referenced by the root layout's
 * metadata. Serves the administrator-uploaded asset from the database when
 * one exists, otherwise falls back to the bundled default (favicon/icon) or
 * an opengraph image generated from the white-label branding config.
 */

const SHORT_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function buildAssetHeaders(
  req: NextRequest,
  contentType: string,
  contentHash: string,
  etag: string,
): Record<string, string> {
  // Requests carrying the current content hash as their ?v= cache-busting
  // param can be cached forever: a rebranded deployment changes the hash and
  // therefore the URL. Bare requests get a short TTL so rebrands propagate.
  const requested_version: string | null = req.nextUrl.searchParams.get("v");
  const is_immutable_request: boolean =
    requested_version === brandingAssetVersionParam(contentHash);
  return {
    "Content-Type": contentType,
    ETag: `"${etag}"`,
    "Cache-Control": is_immutable_request
      ? IMMUTABLE_CACHE_CONTROL
      : SHORT_CACHE_CONTROL,
    "X-Content-Type-Options": "nosniff",
    // Defense-in-depth for admin-uploaded SVG favicons: never execute
    // scripts/loads if the asset URL is opened as a document.
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  };
}

function requestMatchesEtag(req: NextRequest, etag: string): boolean {
  const if_none_match: string | null = req.headers.get("if-none-match");
  return if_none_match !== null && if_none_match.includes(`"${etag}"`);
}

function serveAssetBytes(
  req: NextRequest,
  bytes: Uint8Array,
  contentType: string,
  contentHash: string,
  resizedTo?: BrandingAssetResizeSize,
): NextResponse {
  // Resized variants get a distinct ETag; the ?v= immutability check stays
  // keyed on the source content hash, which is what the URL carries.
  const etag: string = resizedTo ? `${contentHash}-s${resizedTo}` : contentHash;
  const headers = buildAssetHeaders(req, contentType, contentHash, etag);
  if (requestMatchesEtag(req, etag)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return new NextResponse(new Uint8Array(bytes), { status: 200, headers });
}

/**
 * Parse the optional ?s= square-resize parameter. Values outside the bounded
 * allowlist are ignored (the original asset is served) rather than rejected,
 * so a stale page referencing a since-removed size degrades to an oversized
 * image instead of a broken one.
 */
function resolveRequestedResizeSize(
  req: NextRequest,
): BrandingAssetResizeSize | null {
  const raw: string | null = req.nextUrl.searchParams.get("s");
  if (raw === null) {
    return null;
  }
  const parsed: number = Number.parseInt(raw, 10);
  if (String(parsed) !== raw || !isBrandingAssetResizeSize(parsed)) {
    console.warn(
      `[/branding] Ignoring resize param s=${JSON.stringify(raw)} not in the allowed size list`,
    );
    return null;
  }
  return parsed;
}

function serveGeneratedOpenGraphImage(req: NextRequest): Response {
  const branding = resolveOpenGraphImageBranding();
  const contentHash = getGeneratedOpenGraphImageHash(branding);
  const headers = buildAssetHeaders(req, "image/png", contentHash, contentHash);
  if (requestMatchesEtag(req, contentHash)) {
    return new NextResponse(null, { status: 304, headers });
  }
  return generatedOpenGraphImageResponse(branding, { headers });
}

export async function GET(
  req: NextRequest,
  context: RouteContext<"/branding/[asset]">,
): Promise<Response> {
  const { asset } = await context.params;
  if (!isValidBrandingAssetKey(asset)) {
    return NextResponse.json(
      {
        success: false,
        message: `Unknown branding asset: ${asset}`,
      },
      { status: 404 },
    );
  }

  // Optional bounded ?s= square resize (e.g. the <Logo /> component requests
  // a 64px variant instead of the full-size upload). A failed/unsupported
  // resize falls back to the original bytes.
  const resize_size: BrandingAssetResizeSize | null =
    resolveRequestedResizeSize(req);

  // Load the administrator-uploaded asset, if any. A database/redis outage
  // must not take down the favicon: fall through to the defaults instead.
  let custom: BrandingAssetContent | null = null;
  let custom_resized: Buffer | null = null;
  try {
    await using dbh = ServerlessDatabase.createDBH();
    await using redis = RedisCache.createConnection();
    const registry = new BrandingAssetsRegistry(
      dbh.db,
      undefined,
      redis.client,
    );
    custom = await registry.getAsset(asset);
    if (custom && resize_size !== null) {
      custom_resized = await getResizedCustomBrandingAsset(
        custom,
        resize_size,
        redis.client,
      );
    }
  } catch (e: unknown) {
    console.error(
      `[/branding/${asset}] Failed to load custom branding asset, serving default:`,
      e,
    );
  }

  if (custom) {
    if (custom_resized) {
      return serveAssetBytes(
        req,
        custom_resized,
        custom.contentType,
        custom.contentHash,
        resize_size ?? undefined,
      );
    }
    return serveAssetBytes(
      req,
      Buffer.from(custom.contentBase64, "base64"),
      custom.contentType,
      custom.contentHash,
    );
  }

  const default_asset = await getDefaultBrandingAsset(asset);
  if (default_asset) {
    if (resize_size !== null) {
      const default_resized: Buffer | null =
        await getResizedDefaultBrandingAsset(
          asset,
          default_asset,
          resize_size,
        );
      if (default_resized) {
        return serveAssetBytes(
          req,
          default_resized,
          default_asset.contentType,
          default_asset.contentHash,
          resize_size,
        );
      }
    }
    return serveAssetBytes(
      req,
      default_asset.bytes,
      default_asset.contentType,
      default_asset.contentHash,
    );
  }

  // The opengraph-image slot has no bundled default: it is generated from
  // the deployment's white-label branding config (friendly name, description,
  // theme colors). Hard-check the key so a future asset slot added without a
  // bundled default fails loudly here instead of serving the wrong image.
  if (asset !== "opengraph-image") {
    console.error(
      `[/branding/${asset}] No default asset configured for this branding asset key!`,
    );
    return NextResponse.json(
      {
        success: false,
        message: `No default asset configured for branding asset: ${asset}`,
      },
      { status: 500 },
    );
  }
  return serveGeneratedOpenGraphImage(req);
}

export const runtime: ServerRuntime = "nodejs";
export const dynamic = "force-dynamic";
