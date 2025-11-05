"use client";

import Logo from "@/components/Logo";
import {
  DashboardLayout,
  type DashboardSidebarItemsAndGroupsDefinitions,
  Wordmark,
} from "@schemavaults/ui";
import Link from "next/link";
import { useMemo, type PropsWithChildren, type ReactElement } from "react";
import getAuthenticatedUserDashboardLinks from "./dashboard-links";
import { useAdmin } from "@schemavaults/auth-react-provider";

export default function AuthenticatedAuthServerLayout({
  children,
}: PropsWithChildren): ReactElement {
  const isAdmin: boolean = useAdmin();
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
      brandHref="https://schemavaults.com"
      logo={<Logo width={40} height={40} />}
      topBarTitle={"@schemavaults/auth-server"}
      sidebarItems={links}
    >
      {children}
    </DashboardLayout>
  );
}
