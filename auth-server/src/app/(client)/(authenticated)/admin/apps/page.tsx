import "server-only";

import AdminAppsPageView from "./admin_apps_page_view";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ReactElement } from "react";
import { preloadAppsTable, SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import type { PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

async function AdminAppsPageServerComponent(
  { dbh, user }: IProtectedAdminServerComponentPageProps
): Promise<ReactElement> {
  const appsRegistry = new SchemaVaultsAppRegistry(dbh.db)

  const preloaded: PreloadedAppsTableDataWithDomainRefs = await preloadAppsTable({
    list_apps_query_type: 'all',
    user,
    appsRegistry,
  });

  return <AdminAppsPageView preloaded={preloaded} />
}

export default async function AdminAppsPage(): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(AdminAppsPageServerComponent)
};

export const runtime: ServerRuntime = "nodejs";
