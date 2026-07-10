import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * A bundled default branding asset, served when an administrator has not
 * uploaded a custom replacement.
 */
export interface DefaultBrandingAsset {
  bytes: Buffer;
  contentType: string;
  /** SHA-256 hex digest of the bytes (stable per build, used for ETags) */
  contentHash: string;
}

const DEFAULT_ASSET_FILES = {
  favicon: { filename: "favicon.ico", contentType: "image/x-icon" },
  icon: { filename: "icon.png", contentType: "image/png" },
} as const;

type DefaultAssetKey = keyof typeof DEFAULT_ASSET_FILES;

function isDefaultAssetKey(key: string): key is DefaultAssetKey {
  return key in DEFAULT_ASSET_FILES;
}

// The default assets are immutable within a deployment, so each file is read
// and hashed at most once per process.
const loaded = new Map<DefaultAssetKey, DefaultBrandingAsset>();

/**
 * public/branding-defaults/ resolves against the working directory in every
 * deployment mode: `next dev`/`next start` run from the auth-server package
 * dir, and the standalone server chdirs to .next/standalone/auth-server,
 * where the Dockerfile copies public/. For serverless deployments the files
 * are force-included in route traces via outputFileTracingIncludes in
 * next.config.ts.
 */
function resolveDefaultAssetPath(filename: string): string {
  return join(process.cwd(), "public", "branding-defaults", filename);
}

/**
 * Resolve the bundled default asset for a branding slot, if one exists.
 * The opengraph-image slot has no static default: it is generated at request
 * time from the deployment's friendly name, description, and theme colors
 * (see /branding/[asset]).
 */
export async function getDefaultBrandingAsset(
  key: string,
): Promise<DefaultBrandingAsset | null> {
  if (!isDefaultAssetKey(key)) {
    return null;
  }

  const cached = loaded.get(key);
  if (cached) {
    return cached;
  }

  const { filename, contentType } = DEFAULT_ASSET_FILES[key];
  const bytes = await readFile(resolveDefaultAssetPath(filename));
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const asset: DefaultBrandingAsset = { bytes, contentType, contentHash };
  loaded.set(key, asset);
  return asset;
}
