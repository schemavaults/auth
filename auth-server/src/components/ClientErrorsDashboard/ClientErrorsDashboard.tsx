"use client";

import { type ReactElement, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@schemavaults/ui";
import { LocalDateTime } from "@schemavaults/auth-ui";
import type { ClientErrorGroupStats } from "@/lib/auth-db/client-errors";
import {
  type ClientErrorPageFilters,
  clientErrorPageFiltersToSearchParams,
} from "@/lib/client-errors/client-error-page-filters";
import { ClientErrorBreakdowns } from "./ClientErrorBreakdowns";
import { ClientErrorStatCards } from "./ClientErrorStatCards";
import { ClientErrorsFilterBar } from "./ClientErrorsFilterBar";
import { ClientErrorsTable } from "./ClientErrorsTable";
import { ClientErrorTimeline } from "./ClientErrorTimeline";
import { describeError } from "./format";
import type { ClientErrorsSnapshot } from "./types";

export const CLIENT_ERRORS_DASHBOARD_PATH = "/admin/client-errors";

export interface ClientErrorsDashboardProps {
  /** Loaded by the page for the filters in its URL. */
  snapshot: ClientErrorsSnapshot;
}

/**
 * The `/admin/client-errors` dashboard. Its filters live in the page URL:
 * changing one navigates, and the page loads the matching snapshot on the
 * server, so a view can be bookmarked and shared.
 */
export function ClientErrorsDashboard({ snapshot }: ClientErrorsDashboardProps): ReactElement {
  const router = useRouter();
  const [loading, startTransition] = useTransition();
  const { filters, stats } = snapshot;

  const navigate = useCallback(
    (next: ClientErrorPageFilters): void => {
      const query: string = clientErrorPageFiltersToSearchParams(next).toString();
      startTransition((): void => {
        router.push(`${CLIENT_ERRORS_DASHBOARD_PATH}${query ? `?${query}` : ""}`, { scroll: false });
      });
    },
    [router],
  );

  const onRefresh = useCallback((): void => {
    startTransition((): void => router.refresh());
  }, [router]);

  const selectedGroup: ClientErrorGroupStats | undefined = stats.top_groups.find(
    (group: ClientErrorGroupStats): boolean => group.fingerprint === filters.fingerprint,
  );
  const selectedGroupLabel: string | null = filters.fingerprint
    ? selectedGroup
      ? describeError(selectedGroup.name, selectedGroup.message)
      : filters.fingerprint
    : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4" data-testid="client-errors-dashboard">
      <Card>
        <CardHeader>
          <CardTitle>Client errors</CardTitle>
          <CardDescription>
            Errors reported by client applications through the auth client SDK. Apps that set{" "}
            <code className="font-mono">disable_telemetry</code> send none.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ClientErrorsFilterBar
            filters={filters}
            appIds={stats.by_app.map((app) => app.client_app_id)}
            selectedGroupLabel={selectedGroupLabel}
            onFiltersChange={navigate}
            onRefresh={onRefresh}
            loading={loading}
          />
          <p className="text-muted-foreground text-xs" aria-live="polite" data-testid="client-errors-status">
            {loading ? "Loading…" : (
              <>
                Loaded <LocalDateTime value={snapshot.fetched_at} />.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <ClientErrorStatCards totals={stats.totals} ranged={filters.range !== "all"} loading={false} />

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <ClientErrorTimeline stats={stats} loading={loading} />
        <ClientErrorBreakdowns
          stats={stats}
          selectedApp={filters.client_app_id}
          selectedGroup={filters.fingerprint}
          onSelectApp={(client_app_id: string | null): void => navigate({ ...filters, client_app_id, page: 1 })}
          onSelectGroup={(fingerprint: string | null): void => navigate({ ...filters, fingerprint, page: 1 })}
          loading={loading}
        />
        <ClientErrorsTable
          errors={snapshot.errors}
          total={snapshot.total}
          page={filters.page}
          onPageChange={(page: number): void => navigate({ ...filters, page })}
          loading={loading}
        />
      </div>
    </div>
  );
}

export default ClientErrorsDashboard;
