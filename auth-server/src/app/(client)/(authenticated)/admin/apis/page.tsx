import "server-only";

import AdminAPIsPageView from "./admin_apis_page_view";

import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ReactElement } from "react";
import {
  preloadApiServersTable,
  SchemaVaultsApiServerRegistry,
} from "@/lib/auth-db/apis";
import type { PreloadedApiServersTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

async function AdminApisPageServerComponent({ dbh, user }: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error("Expected user to be an admin!")
  }

  const apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);

  const preloaded: PreloadedApiServersTableDataWithDomainRefs =
    await preloadApiServersTable({
      list_api_servers_query_type: "all",
      user,
      apiServerRegistry,
    });

  return <AdminAPIsPageView preloaded={preloaded} />
}

export default async function AdminAPIsPage(): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(AdminApisPageServerComponent, { next_href: "/admin/apis" });
}

export const runtime: ServerRuntime = "nodejs";
