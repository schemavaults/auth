import "server-only";
import type { ReactElement } from "react";

import AdminPageView from "./admin_page_view";
import { withAdminServerComponentRouteGuard } from "@/lib/withAdminRouteGuard";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

async function AuthServerAdminDashboardPageServerComponent(): Promise<ReactElement> {
  return <AdminPageView />;
}

export default async function AuthServerAdminDashboardPage(): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(AuthServerAdminDashboardPageServerComponent);
}

export const runtime: ServerRuntime = "nodejs";
