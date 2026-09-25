"use client";

import { useMemo, type ReactElement } from "react";
import { SegmentedBar, cn, type SegmentedBarSegment } from "@schemavaults/ui";
import { TRACE_TILES } from "../tiles";
import {
  countByCategory,
  summarizeDurations,
  traceDurationMs,
  type CategoryCount,
  type DurationStats,
  type OperationStats,
} from "../trace-analytics";
import { formatCount, formatDuration, formatShare } from "../format";
import {
  TRACE_ACCENT_COLOR,
  TRACE_CATEGORY_ORDER,
  getTraceCategoryColor,
  getTraceCategoryLabel,
} from "../trace-categories";
import { RankedBarList, type RankedBarItem } from "../charts/RankedBarList";
import { TraceTileCard } from "./TraceTileCard";
import type { TraceTileProps } from "./tile-props";

/** How many operations the ranking tiles list. */
const RANKING_SIZE: number = 10;

interface CategoryRow extends CategoryCount {
  stats: DurationStats;
}

/** Share of traces per category as one stacked bar, over a table that filters. */
export function CategoryBreakdownTile({
  traces,
  summary,
  refreshing,
  selectedCategories,
  toggleCategory,
}: TraceTileProps): ReactElement {
  const rows: CategoryRow[] = useMemo((): CategoryRow[] => {
    const durations = new Map<string, number[]>();
    for (const trace of traces) {
      const list: number[] | undefined = durations.get(trace.op_category);
      if (list) {
        list.push(traceDurationMs(trace));
      } else {
        durations.set(trace.op_category, [traceDurationMs(trace)]);
      }
    }
    return countByCategory(traces, TRACE_CATEGORY_ORDER).map(
      (entry: CategoryCount): CategoryRow => ({
        ...entry,
        stats: summarizeDurations(durations.get(entry.op_category) ?? []),
      }),
    );
  }, [traces]);

  const segments: SegmentedBarSegment[] = rows.map(
    (row: CategoryRow): SegmentedBarSegment => ({
      id: row.op_category,
      label: getTraceCategoryLabel(row.op_category),
      value: row.count,
      fill: getTraceCategoryColor(row.op_category),
    }),
  );

  return (
    <TraceTileCard
      tile={TRACE_TILES["category-breakdown"]}
      description="Click a category to filter by it."
      refreshing={refreshing}
    >
      <SegmentedBar
        segments={segments}
        label={`Traces per category across ${summary.count} traces`}
        size="lg"
        animate={false}
        onSegmentClick={(segment: SegmentedBarSegment): void => toggleCategory(segment.id)}
        renderLegend={(): ReactElement => (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th scope="col" className="pb-2 font-medium">Category</th>
                <th scope="col" className="pb-2 text-right font-medium">Traces</th>
                <th scope="col" className="pb-2 text-right font-medium">Share</th>
                <th scope="col" className="pb-2 text-right font-medium">Median</th>
                <th scope="col" className="pb-2 text-right font-medium">p95</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((row: CategoryRow): ReactElement => {
                const selected: boolean = selectedCategories.includes(row.op_category);
                return (
                  <tr key={row.op_category} className={cn("border-b last:border-b-0", selected && "bg-muted")}>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={(): void => toggleCategory(row.op_category)}
                        aria-pressed={selected}
                        title={selected ? "Remove this category from the filter" : "Filter by this category"}
                        className="hover:bg-muted/60 focus-visible:ring-ring -ml-2 flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2"
                      >
                        <span
                          aria-hidden="true"
                          className="inline-block size-2.5 shrink-0 rounded-[3px]"
                          style={{ backgroundColor: getTraceCategoryColor(row.op_category) }}
                        />
                        {getTraceCategoryLabel(row.op_category)}
                      </button>
                    </td>
                    <td className="py-1 text-right font-semibold">{formatCount(row.count)}</td>
                    <td className="text-muted-foreground py-1 text-right">
                      {formatShare(summary.count > 0 ? row.count / summary.count : 0)}
                    </td>
                    <td className="py-1 text-right">{formatDuration(row.stats.p50)}</td>
                    <td className="py-1 text-right">{formatDuration(row.stats.p95)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      />
    </TraceTileCard>
  );
}

function rankingProps(props: TraceTileProps) {
  return {
    color: TRACE_ACCENT_COLOR,
    selectedIds: props.selectedOperations,
    onSelect: (item: RankedBarItem): void => props.toggleOperation(item.id),
  };
}

/** Operations ranked by p95 duration: where the time goes. */
export function SlowestOperationsTile(props: TraceTileProps): ReactElement {
  const items: RankedBarItem[] = useMemo(
    (): RankedBarItem[] =>
      [...props.operations]
        .sort((a: OperationStats, b: OperationStats): number => b.p95 - a.p95)
        .slice(0, RANKING_SIZE)
        .map(
          (op: OperationStats): RankedBarItem => ({
            id: op.op_name,
            label: op.op_name,
            value: op.p95,
            valueLabel: formatDuration(op.p95),
            detail: `${formatCount(op.count)} traces · median ${formatDuration(op.p50)}`,
          }),
        ),
    [props.operations],
  );
  return (
    <TraceTileCard
      tile={TRACE_TILES["slowest-operations"]}
      description={`Top ${RANKING_SIZE} by p95 duration. Click one to filter by it.`}
      refreshing={props.refreshing}
    >
      <RankedBarList items={items} label="Operations ranked by p95 duration" {...rankingProps(props)} />
    </TraceTileCard>
  );
}

/** Operations ranked by how many traces they recorded. */
export function BusiestOperationsTile(props: TraceTileProps): ReactElement {
  const items: RankedBarItem[] = useMemo(
    (): RankedBarItem[] =>
      props.operations.slice(0, RANKING_SIZE).map(
        (op: OperationStats): RankedBarItem => ({
          id: op.op_name,
          label: op.op_name,
          value: op.count,
          valueLabel: formatCount(op.count),
          detail: formatShare(op.share),
        }),
      ),
    [props.operations],
  );
  return (
    <TraceTileCard
      tile={TRACE_TILES["busiest-operations"]}
      description={`Top ${RANKING_SIZE} by trace count. Click one to filter by it.`}
      refreshing={props.refreshing}
    >
      <RankedBarList items={items} label="Operations ranked by trace count" {...rankingProps(props)} />
    </TraceTileCard>
  );
}
