import "server-only";

import AdminErrorsPageView from "./admin_errors_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import type { ErrorRow } from "@/lib/auth-db/errors";
import { connection } from "next/server";

async function PreloadedAdminErrorsPage({
  user,
  dbh,
}: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!"
    );
  }

  const errors: ErrorRow[] = await dbh.db
    .selectFrom("errors")
    .selectAll()
    .orderBy("created_at", "desc")
    .limit(200)
    .execute();

  return <AdminErrorsPageView preloaded={errors} />;
}

export default async function AdminErrorsServerComponent(): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(PreloadedAdminErrorsPage, { next_href: "/admin/errors" });
}

export const runtime: ServerRuntime = "nodejs";
