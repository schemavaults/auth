import "server-only";

import AdminTracesPageView from "./admin_traces_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import {
  listServerTraceOperations,
  listServerTraces,
} from "@/lib/auth-db/server-traces";
import {
  getServerTraceRangeStart,
  isServerTraceOpCategory,
  parseServerTraceFilters,
  type ServerTraceFilters,
} from "@/lib/server-trace-filters";
import type {
  ServerTraceOperation,
  ServerTraceOperationsSnapshot,
  ServerTracesSnapshot,
} from "@/components/ServerTracesDashboard";
import { connection } from "next/server";

async function PreloadedAdminTracesPage(
  { user, dbh }: IProtectedAdminServerComponentPageProps,
  pageProps: PageProps<"/admin/traces">,
): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!"
    );
  }

  // The dashboard keeps its filters in the URL; preload exactly that view.
  const filters: ServerTraceFilters = parseServerTraceFilters(await pageProps.searchParams);
  const fetched_at: number = Date.now();
  const since_ms: number | undefined = getServerTraceRangeStart(filters.range, fetched_at);

  const [traces, operations] = await Promise.all([
    listServerTraces(dbh.db, {
      limit: filters.limit,
      since_ms,
      op_names: filters.op_names,
      op_categories: filters.op_categories,
    }),
    listServerTraceOperations(dbh.db, { since_ms }),
  ]);

  const preloadedTraces: ServerTracesSnapshot = { traces, fetched_at, filters };
  const preloadedOperations: ServerTraceOperationsSnapshot = {
    operations: operations.filter(
      (op): op is ServerTraceOperation => isServerTraceOpCategory(op.op_category),
    ),
    fetched_at,
    range: filters.range,
  };

  return (
    <AdminTracesPageView
      preloadedTraces={preloadedTraces}
      preloadedOperations={preloadedOperations}
    />
  );
}

export default async function AdminTracesServerComponent(
  pageProps: PageProps<"/admin/traces">,
): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(
    (props) => PreloadedAdminTracesPage(props, pageProps),
    { next_href: "/admin/traces" },
  );
}

export const runtime: ServerRuntime = "nodejs";
