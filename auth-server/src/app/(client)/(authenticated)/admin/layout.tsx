import "server-only";

import redirectWithError from "@/lib/redirect-with-error";
import type { ReactElement, ReactNode } from "react";
import { type IProtectedAdminServerComponentPageProps, withAdminServerComponentRouteGuard } from "@/lib/withAdminRouteGuard";

export default async function AdminPathsRouteGuardServerComponent({
  children,
}: {
  children: ReactNode;
  }): Promise<ReactNode> {
  const protected_layout: ReactElement = await withAdminServerComponentRouteGuard(
    async function AdminProtectedChildPage({ user }: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
      if (!user || !user.admin) {
        redirectWithError(403, "forbidden")
      }
      return <>{children}</>
    }
  )
  return protected_layout;
}
