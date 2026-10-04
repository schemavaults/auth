import "server-only";

import AdminClientErrorsPageView from "./admin_client_errors_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import { getClientErrorStats, listClientErrors } from "@/lib/auth-db/client-errors";
import {
  CLIENT_ERRORS_PAGE_SIZE,
  type ClientErrorPageFilters,
  getClientErrorRangeStart,
  parseClientErrorPageFilters,
} from "@/lib/client-errors/client-error-page-filters";
import type { ClientErrorsSnapshot } from "@/components/ClientErrorsDashboard";
import {
  loadClientErrorStorageStatus,
  purgeExpiredClientErrors,
} from "@/lib/client-errors/intake-policy";
import { RedisCache } from "@/lib/redis";
import { connection } from "next/server";

async function PreloadedAdminClientErrorsPage(
  { user, dbh }: IProtectedAdminServerComponentPageProps,
  pageProps: PageProps<"/admin/client-errors">,
): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error("Expected user to have been asserted to be an admin by this point!");
  }

  // The dashboard keeps its filters in the URL; load exactly that view.
  const filters: ClientErrorPageFilters = parseClientErrorPageFilters(await pageProps.searchParams);
  const fetched_at: number = Date.now();
  const queryFilters = {
    since_ms: getClientErrorRangeStart(filters.range, fetched_at),
    client_app_id: filters.client_app_id ?? undefined,
    fingerprint: filters.fingerprint ?? undefined,
    q: filters.q ?? undefined,
  };

  await using redis = RedisCache.createConnection();
  // Apply the retention period first (at most hourly) so the view never shows expired reports.
  const settings = await loadClientErrorStorageStatus(dbh.db, redis.client);
  const purged: number | null = await purgeExpiredClientErrors(dbh.db, redis.client, settings.retention_days, fetched_at);

  const [stats, page, storage] = await Promise.all([
    getClientErrorStats(dbh.db, queryFilters, fetched_at),
    listClientErrors(dbh.db, {
      ...queryFilters,
      limit: CLIENT_ERRORS_PAGE_SIZE,
      offset: (filters.page - 1) * CLIENT_ERRORS_PAGE_SIZE,
    }),
    purged ? loadClientErrorStorageStatus(dbh.db, redis.client) : Promise.resolve(settings),
  ]);

  const snapshot: ClientErrorsSnapshot = {
    filters,
    stats,
    errors: page.errors,
    total: page.total,
    storage,
    fetched_at,
  };

  return <AdminClientErrorsPageView snapshot={snapshot} />;
}

export default async function AdminClientErrorsServerComponent(
  pageProps: PageProps<"/admin/client-errors">,
): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(
    (props) => PreloadedAdminClientErrorsPage(props, pageProps),
    { next_href: "/admin/client-errors" },
  );
}

export const runtime: ServerRuntime = "nodejs";
