"use client";

import type { ReactElement } from "react";
import { useAuthServerFriendlyName } from "@/components/Wordmark";
import { useAppIconUrl } from "@/components/AppIconUrl";
import {
  brandingAssetSizedUrl,
  pickBrandingAssetResizeSize,
} from "@/lib/branding/branding-asset-version";

export interface LogoProps {
  height: number;
  width: number;
}

/**
 * @description Renders the deployment's app icon: the administrator-uploaded
 * branding asset (managed on /admin/settings) when one exists, falling back
 * to the bundled default. The cache-busted /branding/icon URL is resolved
 * server-side in the root layout and delivered via <AppIconUrlProvider />.
 */
export function Logo({ width, height }: LogoProps): ReactElement {
  const friendly_name: string = useAuthServerFriendlyName();
  const app_icon_url: string = useAppIconUrl();
  // A plain <img> rather than next/image: the icon's dynamic ?v= content-hash
  // URL would require an images.localPatterns entry without a `search`
  // constraint, which Next documents as an optimizer cache-enumeration risk.
  // Downscaling happens server-side instead, via the branding route's bounded
  // ?s= resize param (with a 2x variant for high-DPI displays), so the
  // full-size upload is never shipped for a small rendered logo.
  const display_size: number = Math.max(width, height);
  const src: string = brandingAssetSizedUrl(
    app_icon_url,
    pickBrandingAssetResizeSize(display_size),
  );
  const src_2x: string = brandingAssetSizedUrl(
    app_icon_url,
    pickBrandingAssetResizeSize(display_size * 2),
  );
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      srcSet={`${src} 1x, ${src_2x} 2x`}
      alt={`${friendly_name} Logo`}
      width={width}
      height={height}
    />
  );
}

export default Logo;
