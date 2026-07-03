"use client";

import Logo from "@/components/Logo";
import {
  DashboardLayout,
  type DashboardSidebarItemsAndGroupsDefinitions,
} from "@schemavaults/ui";
import { Wordmark, useAuthServerFriendlyName } from "@/components/Wordmark";
import { useAuthServerUrl } from "@/components/AuthServerUrl";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, type PropsWithChildren, type ReactElement } from "react";
import getAuthenticatedUserDashboardLinks from "./dashboard-links";
import { useAdmin } from "@schemavaults/auth-react-provider";

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
      Link={({ href, className, children }): ReactElement => {
        return (
          <Link href={href} className={className}>
            {children}
          </Link>
        );
      }}
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
