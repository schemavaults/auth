import "server-only";

import redirectWithError from "@/lib/redirect-with-error";
import type { ReactElement, ReactNode } from "react";
import { type IProtectedAdminServerComponentPageProps, withAdminServerComponentRouteGuard } from "@/lib/withAdminRouteGuard";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

export default async function AdminPathsRouteGuardServerComponent({
  children,
}: {
  children: ReactNode;
  }): Promise<ReactNode> {
  await connection();
  const protected_layout: ReactElement = await withAdminServerComponentRouteGuard(
    async function AdminProtectedChildPage({ user }: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
      if (!user || !user.admin) {
        redirectWithError(403, "forbidden")
      }
      return <>{children}</>
    },
    // Layouts cannot know which /admin sub-page was requested, and this
    // layout guard's login redirect wins over the per-page guards', so
    // the preserved destination for any admin page is the admin
    // dashboard root.
    { next_href: "/admin" },
  )
  return protected_layout;
}

export const runtime: ServerRuntime = "nodejs";
