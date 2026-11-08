import type { ReactElement } from "react";
import { SiteBrand } from "./site-brand";
import { SiteNav } from "./site-nav";

/**
 * The header on every page: the SchemaVaults logo and wordmark (linking
 * home) and the navigation between the demos. Not sticky: the root layout's
 * body is its own scroll container (`overflow-y-scroll`), which would stop
 * `position: sticky` from sticking.
 *
 * It is `h-14` (3.5rem) tall: pages that fill the rest of the viewport (the
 * agents workspace) subtract that, `h-[calc(100dvh-3.5rem)]`.
 */
export function SiteHeader(): ReactElement {
  return (
    <header className="h-14 shrink-0 border-b border-border bg-background" data-testid="site-header">
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-4 px-4">
        <SiteBrand logoSize={32} tagline="Auth example app" testId="site-header-home-link" />
        <SiteNav />
      </div>
    </header>
  );
}

export default SiteHeader;
