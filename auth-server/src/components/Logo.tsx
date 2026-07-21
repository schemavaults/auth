"use client";

import type { ReactElement } from "react";
import { useAuthServerFriendlyName } from "@/components/Wordmark";
import { useAppIconUrl } from "@/components/AppIconUrl";

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
  // A plain <img> rather than next/image: the /branding/icon route already
  // serves ETag'd, immutably-cacheable bytes, and routing its dynamic ?v=
  // content-hash URL through the image optimizer would require an
  // images.localPatterns entry without a `search` constraint, which Next
  // documents as an optimizer cache-enumeration risk.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={app_icon_url}
      alt={`${friendly_name} Logo`}
      width={width}
      height={height}
    />
  );
}

export default Logo;
