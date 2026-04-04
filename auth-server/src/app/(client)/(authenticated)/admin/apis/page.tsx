import "server-only";

import AdminAPIsPageView from "./admin_apis_page_view";

import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ReactElement } from "react";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

async function AdminApisPageServerComponent({ user }: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error("Expected user to be an admin!")
  }
  return <AdminAPIsPageView />
}

export default async function AdminAPIsPage(): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(AdminApisPageServerComponent);
}

export const runtime: ServerRuntime = "nodejs";
