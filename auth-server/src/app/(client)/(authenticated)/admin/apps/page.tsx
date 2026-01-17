import "server-only";

import AdminAppsPageView from "./admin_apps_page_view";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { ReactElement } from "react";

async function AdminAppsPageServerComponent(): Promise<ReactElement> {
  return <AdminAppsPageView />
}

export default async function AdminAppsPage(): Promise<ReactElement> {
  return await withAdminServerComponentRouteGuard(AdminAppsPageServerComponent)
};
