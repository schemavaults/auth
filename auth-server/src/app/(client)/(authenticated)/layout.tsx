"use client";

import Logo from "@/components/Logo";
import {
  DashboardLayout,
  type DashboardLayoutProps,
  type DashboardSidebarItemsAndGroupsDefinitions,
} from "@schemavaults/ui";
import { Wordmark, useAuthServerFriendlyName } from "@/components/Wordmark";
import { useAuthServerUrl } from "@/components/AuthServerUrl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type PropsWithChildren, type ReactElement } from "react";
import getAuthenticatedUserDashboardLinks from "./dashboard-links";
import { useAdmin } from "@schemavaults/auth-react-provider";

type DashboardSidebarLinkProps = Parameters<DashboardLayoutProps["Link"]>[0];

/**
 * @description The sidebar's link component. Declared at module scope so
 * DashboardLayout gets the same component on every render (an inline one would
 * remount every sidebar link each time this layout re-renders). Forwards
 * `aria-current`, which DashboardLayout sets to "page" on the link for the
 * current page.
 */
function DashboardSidebarLink({
  href,
  className,
  onClick,
  "aria-current": ariaCurrent,
  children,
}: DashboardSidebarLinkProps): ReactElement {
  return (
    <Link
      href={href}
      className={className}
      onClick={onClick}
      aria-current={ariaCurrent}
    >
      {children}
    </Link>
  );
}

export default function AuthenticatedAuthServerLayout({
  children,
}: PropsWithChildren): ReactElement {
  const isAdmin: boolean = useAdmin();
  const friendlyName: string = useAuthServerFriendlyName();
  const authServerUrl: string = useAuthServerUrl();
  const links: DashboardSidebarItemsAndGroupsDefinitions = useMemo(
    () => getAuthenticatedUserDashboardLinks(isAdmin),
    [isAdmin],
  );

  return (
    <DashboardLayout
      wordmark={<Wordmark />}
      Link={DashboardSidebarLink}
      brandHref={authServerUrl}
      logo={<Logo width={40} height={40} />}
      topBarTitle={friendlyName}
      sidebarItems={links}
      usePathname={usePathname}
    >
      {children}
    </DashboardLayout>
  );
}
