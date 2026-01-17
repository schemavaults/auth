import "server-only";

import AdminAPIsPageView from "./admin_apis_page_view";

import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ReactElement } from "react";

async function AdminApisPageServerComponent({ dbh, user }: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
  return <AdminAPIsPageView />
}

export default async function AdminAPIsPage(): Promise<ReactElement> {
  return await withAdminServerComponentRouteGuard(AdminApisPageServerComponent);
}
