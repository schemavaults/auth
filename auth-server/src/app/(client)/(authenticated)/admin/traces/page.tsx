import "server-only";

import AdminTracesPageView from "./admin_traces_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";

async function PreloadedAdminTracesPage({
  user,
  dbh,
}: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!"
    );
  }

  const traces: ServerTraceRow[] = await dbh.db
    .selectFrom("server_traces")
    .selectAll()
    .orderBy("start_time", "desc")
    .limit(200)
    .execute();

  return <AdminTracesPageView preloaded={traces} />;
}

export default async function AdminTracesServerComponent(): Promise<ReactElement> {
  return await withAdminServerComponentRouteGuard(PreloadedAdminTracesPage);
}

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";
