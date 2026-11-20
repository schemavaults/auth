"use client";

import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@schemavaults/ui";

/** A link out of the API reference, back to the host app's own pages. */
export interface ApiDocsBackLinkTarget {
  /** Where the link goes, e.g. `/` or `/dashboard`. */
  readonly href: string;
  /** Link text (default `"Back"`). */
  readonly label?: string;
}

export interface ApiDocsBackLinkProps extends ApiDocsBackLinkTarget {
  className?: string;
}

/** Arrow of the back link (lucide's `arrow-left`, inlined so the package needs no icon library). */
function ArrowLeftIcon(): ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4 shrink-0"
      aria-hidden="true"
    >
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

/** "← Back to …" link from the docs to another page of the app. */
export function ApiDocsBackLink({ href, label = "Back", className }: ApiDocsBackLinkProps): ReactElement {
  return (
    <Link
      href={href}
      data-testid="api-docs-back-link"
      className={cn(
        "inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline",
        className,
      )}
    >
      <ArrowLeftIcon />
      {label}
    </Link>
  );
}

export interface ApiDocsNavigationProps {
  /** Rendered first, as an {@link ApiDocsBackLink}. */
  backLink?: ApiDocsBackLinkTarget;
  /**
   * The app's own navigation UI (links, a menu, a logo), rendered after the
   * back link. Bring your own `<nav>` landmark if it is a list of links.
   */
  navigation?: ReactNode;
  className?: string;
}

/**
 * The row at the top of the docs pages that leads back into the app: a back
 * link and / or custom navigation. Renders nothing when given neither.
 */
export function ApiDocsNavigation({ backLink, navigation, className }: ApiDocsNavigationProps): ReactElement | null {
  const hasNavigation = navigation !== undefined && navigation !== null && navigation !== false;
  if (!backLink && !hasNavigation) return null;
  return (
    <div
      data-testid="api-docs-navigation"
      className={cn("flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm", className)}
    >
      {backLink ? <ApiDocsBackLink href={backLink.href} label={backLink.label} /> : null}
      {hasNavigation ? navigation : null}
    </div>
  );
}

export default ApiDocsNavigation;
