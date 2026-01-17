import "server-only";
import type { ReactElement } from "react";

import AdminPageView from "./admin_page_view";
import { withAdminServerComponentRouteGuard } from "@/lib/withAdminRouteGuard";

async function AuthServerAdminDashboardPageServerComponent(): Promise<ReactElement> {
  return <AdminPageView />;
}

export default async function AuthServerAdminDashboardPage(): Promise<ReactElement> {
  return await withAdminServerComponentRouteGuard(AuthServerAdminDashboardPageServerComponent);
}
