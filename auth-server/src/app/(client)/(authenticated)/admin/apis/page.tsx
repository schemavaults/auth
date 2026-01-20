import "server-only";

import AdminAPIsPageView from "./admin_apis_page_view";

import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ReactElement } from "react";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";

async function AdminApisPageServerComponent({ user }: IProtectedAdminServerComponentPageProps<AuthDatabase>): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error("Expected user to be an admin!")
  }
  return <AdminAPIsPageView />
}

export default async function AdminAPIsPage(): Promise<ReactElement> {
  return await withAdminServerComponentRouteGuard(AdminApisPageServerComponent);
}
