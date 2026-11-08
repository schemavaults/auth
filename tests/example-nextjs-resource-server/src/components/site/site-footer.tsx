import "server-only";
import Link from "next/link";
import type { ReactElement } from "react";
import { getSchemaVaultsAuthServerUrl } from "@schemavaults/auth-server-sdk";
import packageJson from "../../../package.json";
import { SiteBrand } from "./site-brand";
import { DEMO_LINKS, HOME_LINK, type SiteLink } from "./site-links";

/** Links to this server's own API surface, beside the demos. */
const API_LINKS: readonly SiteLink[] = [
  { id: "api-reference", href: "/docs", label: "API reference" },
  { id: "openapi-document", href: "/api/openapi.json", label: "OpenAPI document" },
  { id: "health", href: "/api/health", label: "Health check" },
];

/** The auth server's host, or null when it cannot be resolved here. */
function authServerHost(): { href: string; host: string } | null {
  try {
    const url = new URL(getSchemaVaultsAuthServerUrl());
    return { href: url.origin, host: url.host };
  } catch {
    // A misconfigured auth server URL is reported by the pages that use it;
    // the footer just leaves the link out.
    return null;
  }
}

function LinkColumn({ title, links }: { title: string; links: readonly SiteLink[] }): ReactElement {
  return (
    <nav aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="flex flex-col gap-2 text-sm">
        {links.map((link: SiteLink) => (
          <li key={link.id}>
            {/* JSON endpoints are not pages: a plain anchor, no prefetch. */}
            {link.href.startsWith("/api/") ? (
              <a href={link.href} className="text-muted-foreground hover:text-foreground hover:underline" data-testid={`site-footer-${link.id}`}>
                {link.label}
              </a>
            ) : (
              <Link href={link.href} className="text-muted-foreground hover:text-foreground hover:underline" data-testid={`site-footer-${link.id}`}>
                {link.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The footer on every page: the brand, links to every demo and to the API. */
export function SiteFooter(): ReactElement {
  const authServer = authServerHost();
  return (
    <footer className="shrink-0 border-t border-border bg-muted/40" data-testid="site-footer">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr]">
        <div className="flex flex-col gap-3 sm:col-span-2 md:col-span-1">
          <SiteBrand logoSize={40} tagline="Auth example app" testId="site-footer-home-link" />
          <p className="max-w-sm text-sm text-muted-foreground">
            A Next.js app and API that signs its users in with a SchemaVaults auth server, one demo per way
            of integrating.
          </p>
        </div>
        <LinkColumn title="Demos" links={[HOME_LINK, ...DEMO_LINKS.filter((link) => link.id !== "api-docs")]} />
        <LinkColumn title="Developers" links={API_LINKS} />
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:justify-between">
          <span className="font-mono [overflow-wrap:anywhere]">
            {packageJson.name} v{packageJson.version}
          </span>
          {authServer ? (
            <span>
              Signs in with{" "}
              <a href={authServer.href} className="underline-offset-4 hover:underline" data-testid="site-footer-auth-server">
                {authServer.host}
              </a>
            </span>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
