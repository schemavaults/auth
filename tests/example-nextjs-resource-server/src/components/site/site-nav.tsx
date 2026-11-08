"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactElement } from "react";
import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  cn,
} from "@schemavaults/ui";
import { PRIMARY_NAV_LINKS, isSiteLinkActive, type SiteLink } from "./site-links";

const LINK_CLASSES =
  "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-muted aria-[current=page]:text-foreground";

function NavLinks({
  pathname,
  className,
  testIdPrefix,
  onNavigate,
}: {
  pathname: string;
  className: string;
  /** `site-nav` in the header row, `site-menu` in the sheet (both can be in the DOM at once). */
  testIdPrefix: "site-nav" | "site-menu";
  onNavigate?: () => void;
}): ReactElement {
  return (
    <ul className={className}>
      {PRIMARY_NAV_LINKS.map((link: SiteLink) => (
        <li key={link.id}>
          <Link
            href={link.href}
            data-testid={`${testIdPrefix}-${link.id}`}
            aria-current={isSiteLinkActive(link, pathname) ? "page" : undefined}
            className={cn(LINK_CLASSES, "block")}
            onClick={onNavigate}
          >
            {link.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MenuIcon(): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

/**
 * The header's navigation: every demo plus the home page, the current one
 * marked with `aria-current="page"`. From `md` up it is a row of links; on
 * smaller screens a menu button opens the same links in a sheet.
 */
export function SiteNav(): ReactElement {
  const pathname: string = usePathname();
  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  return (
    <>
      <nav aria-label="Main" className="hidden md:block">
        <NavLinks pathname={pathname} className="flex items-center gap-1" testIdPrefix="site-nav" />
      </nav>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open the navigation menu"
            data-testid="site-nav-menu-button"
          >
            <MenuIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-72">
          <SheetHeader>
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>The demos of this example app.</SheetDescription>
          </SheetHeader>
          <nav aria-label="Menu" className="px-2">
            <NavLinks
              pathname={pathname}
              className="flex flex-col gap-1"
              testIdPrefix="site-menu"
              onNavigate={() => setMenuOpen(false)}
            />
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

export default SiteNav;
