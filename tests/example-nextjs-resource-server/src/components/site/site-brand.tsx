import Image from "next/image";
import Link from "next/link";
import type { ReactElement } from "react";
import { Wordmark } from "@schemavaults/ui";

export interface SiteBrandProps {
  /** Rendered size of the (square) logo, in CSS pixels. */
  logoSize: number;
  /** Second line under the wordmark; omitted when not given. */
  tagline?: string;
  /** `data-testid` of the link home. */
  testId: string;
}

/**
 * The SchemaVaults logo and wordmark, linking to the home page. The logo is
 * `public/logo.png` (the same artwork as the `app/icon.png` favicon), sized
 * down by Next.js image optimization.
 */
export function SiteBrand({ logoSize, tagline, testId }: SiteBrandProps): ReactElement {
  return (
    <Link
      href="/"
      data-testid={testId}
      className="flex min-w-0 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Image
        src="/logo.png"
        alt="SchemaVaults logo"
        width={logoSize}
        height={logoSize}
        className="shrink-0"
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <Wordmark className="text-lg font-bold" />
        {tagline ? (
          <span className="truncate text-xs text-muted-foreground">{tagline}</span>
        ) : null}
      </span>
    </Link>
  );
}

export default SiteBrand;
