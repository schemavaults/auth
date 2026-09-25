"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactElement,
} from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  MultiSelect,
  cn,
  type MultiSelectOption,
} from "@schemavaults/ui";
import { AlertTriangle } from "lucide-react";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";
import {
  getServerTraceRangeStart,
  isServerTraceOpCategory,
  serverTraceFiltersToSearchParams,
  type ServerTraceFilters,
} from "@/lib/server-trace-filters";
import {
  summarizeOperations,
  summarizeTraces,
  type OperationStats,
  type TraceSummary,
} from "./trace-analytics";
import { LocalDateTime } from "@schemavaults/auth-ui";
import { formatCount } from "./format";
import { TRACE_CHART_COLOR_VARIABLES } from "./trace-categories";
import {
  TRACE_TILE_IDS,
  TRACE_TILES,
  useVisibleTraceTiles,
  type TraceTileId,
} from "./tiles";
import {
  useServerTraceOperations,
  useServerTraces,
  type ServerTraceOperation,
  type ServerTraceOperationsSnapshot,
  type ServerTracesSnapshot,
} from "./use-server-traces";
import { ServerTracesFilterBar } from "./ServerTracesFilterBar";
import type { TraceTileProps } from "./tiles/tile-props";
import { SummaryTile } from "./tiles/SummaryTile";
import { DurationHistogramTile, DurationScatterTile } from "./tiles/DistributionTiles";
import { LatencyOverTimeTile, ThroughputTile } from "./tiles/TimeTiles";
import {
  BusiestOperationsTile,
  CategoryBreakdownTile,
  SlowestOperationsTile,
} from "./tiles/BreakdownTiles";
import { OperationStatsTile } from "./tiles/OperationStatsTile";
import { TraceLogTile } from "./tiles/TraceLogTile";

const TILE_COMPONENTS: Record<TraceTileId, ComponentType<TraceTileProps>> = {
  summary: SummaryTile,
  "duration-histogram": DurationHistogramTile,
  "duration-scatter": DurationScatterTile,
  "latency-over-time": LatencyOverTimeTile,
  throughput: ThroughputTile,
  "category-breakdown": CategoryBreakdownTile,
  "slowest-operations": SlowestOperationsTile,
  "busiest-operations": BusiestOperationsTile,
  "operation-stats": OperationStatsTile,
  "trace-log": TraceLogTile,
};

const TILE_OPTIONS: MultiSelectOption[] = TRACE_TILE_IDS.map(
  (id: TraceTileId): MultiSelectOption => ({
    value: id,
    label: TRACE_TILES[id].label,
    description: TRACE_TILES[id].description,
  }),
);

function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((existing: T): boolean => existing !== value)
    : [...values, value];
}

/** Traces matching the filters in the range, from the per-operation counts. */
function countMatching(
  operations: readonly ServerTraceOperation[],
  filters: ServerTraceFilters,
): number {
  return operations
    .filter(
      (op: ServerTraceOperation): boolean =>
        (filters.op_names.length === 0 || filters.op_names.includes(op.op_name)) &&
        (filters.op_categories.length === 0 ||
          filters.op_categories.includes(op.op_category)),
    )
    .reduce((sum: number, op: ServerTraceOperation): number => sum + op.count, 0);
}

export interface ServerTracesDashboardProps {
  /** SSR-preloaded listing for the filters in the page URL. */
  preloadedTraces: ServerTracesSnapshot;
  /** SSR-preloaded operations for the time range in the page URL. */
  preloadedOperations: ServerTraceOperationsSnapshot;
}

/**
 * The `/admin/traces` dashboard: one filter row (kept in the page URL)
 * scoping a grid of tiles the viewer picks, all computed from the same
 * sample of the most recent matching traces.
 */
export function ServerTracesDashboard({
  preloadedTraces,
  preloadedOperations,
}: ServerTracesDashboardProps): ReactElement {
  const [filters, setFilters] = useState<ServerTraceFilters>(preloadedTraces.filters);
  const [visibleTiles, setVisibleTiles] = useVisibleTraceTiles();

  const traces = useServerTraces(filters, { initialData: preloadedTraces });
  const operations = useServerTraceOperations(filters.range, {
    initialData: preloadedOperations,
  });

  // Mirror the filters into the URL so the view can be bookmarked and shared.
  // The native history API updates the URL without re-running the page.
  useEffect((): void => {
    const query: string = serverTraceFiltersToSearchParams(filters).toString();
    const search: string = query ? `?${query}` : "";
    if (search !== window.location.search) {
      window.history.replaceState(null, "", `${window.location.pathname}${search}`);
    }
  }, [filters]);

  const toggleOperation = useCallback((op_name: string): void => {
    setFilters((current: ServerTraceFilters): ServerTraceFilters => ({
      ...current,
      op_names: toggle(current.op_names, op_name),
    }));
  }, []);

  const toggleCategory = useCallback((op_category: string): void => {
    if (!isServerTraceOpCategory(op_category)) return;
    setFilters((current: ServerTraceFilters): ServerTraceFilters => ({
      ...current,
      op_categories: toggle(current.op_categories, op_category),
    }));
  }, []);

  // Every tile renders the snapshot's own filters, so the numbers agree
  // while a new filter's listing is still loading.
  const snapshot: ServerTracesSnapshot | undefined = traces.data;
  const sample: readonly ServerTraceRow[] = useMemo(
    (): readonly ServerTraceRow[] => snapshot?.traces ?? [],
    [snapshot],
  );
  const summary: TraceSummary = useMemo((): TraceSummary => summarizeTraces(sample), [sample]);
  const operationStats: OperationStats[] = useMemo(
    (): OperationStats[] => summarizeOperations(sample),
    [sample],
  );

  const timeWindow = useMemo((): { from: number; to: number } => {
    const fetched_at: number = snapshot?.fetched_at ?? 0;
    const sample_filters: ServerTraceFilters = snapshot?.filters ?? filters;
    const range_start: number | undefined = getServerTraceRangeStart(
      sample_filters.range,
      fetched_at,
    );
    // A full sample may stop short of the range start: start the axis at the
    // oldest loaded trace instead of drawing an empty stretch that reads as
    // "no traffic".
    const truncated: boolean = sample.length >= sample_filters.limit;
    const from: number =
      range_start === undefined || truncated
        ? (summary.first_start ?? fetched_at)
        : range_start;
    const to: number =
      range_start === undefined ? (summary.last_start ?? fetched_at) : fetched_at;
    return { from, to };
  }, [snapshot, filters, sample.length, summary.first_start, summary.last_start]);

  const matchingCount: number | null = useMemo((): number | null => {
    if (!snapshot || !operations.data || operations.data.range !== snapshot.filters.range) {
      return null;
    }
    return countMatching(operations.data.operations, snapshot.filters);
  }, [snapshot, operations.data]);

  const refreshing: boolean = traces.isValidating;
  const loading: boolean = !snapshot;

  const tileProps: TraceTileProps = {
    traces: sample,
    summary,
    operations: operationStats,
    timeWindow,
    matchingCount,
    loading,
    refreshing,
    selectedOperations: filters.op_names,
    selectedCategories: filters.op_categories,
    toggleOperation,
    toggleCategory,
  };

  const onRefresh = useCallback((): void => {
    void traces.mutate();
    void operations.mutate();
  }, [traces, operations]);

  return (
    <div
      className={cn("flex w-full min-w-0 flex-col gap-4", TRACE_CHART_COLOR_VARIABLES)}
      data-testid="server-traces-dashboard"
    >
      <Card data-testid="server-traces-controls">
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-x-6 gap-y-3 space-y-0">
          <div className="flex min-w-0 flex-col gap-1.5">
            <CardTitle>Server traces</CardTitle>
            <CardDescription>
              Timing traces of the server&apos;s database queries, HTTP calls and subroutines.
            </CardDescription>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <label
              htmlFor="server-traces-visible-tiles"
              className="text-muted-foreground text-xs font-medium uppercase tracking-wide"
            >
              Visible tiles
            </label>
            <MultiSelect
              id="server-traces-visible-tiles"
              options={TILE_OPTIONS}
              value={visibleTiles}
              onValueChange={setVisibleTiles}
              placeholder="No tiles"
              searchPlaceholder="Search tiles…"
              maxDisplay={1}
              size="sm"
              align="end"
              className="w-72 max-w-full"
              contentClassName="w-80 max-w-[calc(100vw-2rem)]"
              data-testid="server-traces-visible-tiles"
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ServerTracesFilterBar
            filters={filters}
            onFiltersChange={setFilters}
            operations={operations.data?.operations}
            refreshing={refreshing}
            onRefresh={onRefresh}
          />

          <p className="text-muted-foreground text-xs" aria-live="polite" data-testid="server-traces-status">
            {snapshot ? (
              <>
                {matchingCount !== null && matchingCount > sample.length
                  ? `Showing the ${formatCount(sample.length)} most recent of ${formatCount(matchingCount)} matching traces — raise the sample size to include older ones.`
                  : `Showing all ${formatCount(sample.length)} matching traces.`}{" "}
                Loaded <LocalDateTime value={snapshot.fetched_at} />.
              </>
            ) : (
              "Loading traces…"
            )}
          </p>

          {traces.error ? (
            <div
              role="alert"
              className="border-destructive/50 text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {traces.error.message}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {visibleTiles.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleTiles.map((id: TraceTileId): ReactElement => {
            const Tile: ComponentType<TraceTileProps> = TILE_COMPONENTS[id];
            return <Tile key={id} {...tileProps} />;
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            Every tile is hidden. Pick some under &ldquo;Visible tiles&rdquo;.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default ServerTracesDashboard;
