import "server-only";

import { createHash } from "node:crypto";
import {
  DEFAULT_FAVICON_BASE64,
  DEFAULT_FAVICON_CONTENT_TYPE,
} from "./default-favicon";
import {
  DEFAULT_ICON_BASE64,
  DEFAULT_ICON_CONTENT_TYPE,
} from "./default-icon";

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

function decodeDefaultAsset(
  base64: string,
  contentType: string,
): DefaultBrandingAsset {
  const bytes = Buffer.from(base64, "base64");
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  return { bytes, contentType, contentHash };
}

const DEFAULT_ASSETS = {
  favicon: decodeDefaultAsset(
    DEFAULT_FAVICON_BASE64,
    DEFAULT_FAVICON_CONTENT_TYPE,
  ),
  icon: decodeDefaultAsset(DEFAULT_ICON_BASE64, DEFAULT_ICON_CONTENT_TYPE),
} as const;

/**
 * Resolve the bundled default asset for a branding slot, if one exists.
 * The opengraph-image slot has no static default: it is generated at request
 * time from the deployment's friendly name, description, and theme colors
 * (see /branding/[asset]).
 */
export function getDefaultBrandingAsset(
  key: string,
): DefaultBrandingAsset | null {
  if (key === "favicon" || key === "icon") {
    return DEFAULT_ASSETS[key];
  }
  return null;
}
