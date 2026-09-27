"use client";

import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  ChartTooltipRow,
  Histogram,
  ScatterPlot,
  binValues,
  type HistogramBucket,
  type HistogramCountNoun,
  type HistogramScaleId,
  type ScatterPlotReferenceLine,
  type ScatterPlotSeries,
  type ScatterPlotTooltipContext,
} from "@schemavaults/ui";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";
import { TRACE_TILES } from "../tiles";
import { niceAxisTop, timeTicks, traceDurationMs } from "../trace-analytics";
import {
  describeDurationBucket,
  formatCount,
  formatDuration,
  formatDurationTick,
  formatInstant,
  formatTimeTick,
} from "../format";
import { getTraceCategoryLabel } from "../trace-categories";
import { DurationScaleToggle, TraceTileCard } from "./TraceTileCard";
import type { TraceTileProps } from "./tile-props";

const HISTOGRAM_HEIGHT: number = 240;
const SCATTER_HEIGHT: number = 260;
const EMPTY_MESSAGE: string = "No traces match the filters";
const TRACE_NOUN: HistogramCountNoun = { singular: "trace", plural: "traces" };

/**
 * The scatter plot's x readout. Module-level (like `formatDuration`) so the
 * plot's memoized points layer never re-renders while the pointer moves.
 */
function formatTraceStart(ms: number): string {
  return formatInstant(ms);
}

/** How trace durations are distributed, on linear or logarithmic buckets. */
export function DurationHistogramTile({
  traces,
  summary,
  refreshing,
}: TraceTileProps): ReactElement {
  const [scale, setScale] = useState<HistogramScaleId>("linear");
  // Durations are whole milliseconds, so no bin is narrower than 1 ms.
  const buckets: HistogramBucket[] = useMemo(
    (): HistogramBucket[] =>
      binValues(traces.map(traceDurationMs), { scale, minBinWidth: 1 }),
    [traces, scale],
  );
  const last: HistogramBucket | undefined = buckets[buckets.length - 1];
  const overflow: HistogramBucket | undefined =
    last && last.upper === null ? last : undefined;

  return (
    <TraceTileCard
      tile={TRACE_TILES["duration-histogram"]}
      description={
        summary.count > 0
          ? `${formatCount(summary.count)} traces · median ${formatDuration(summary.p50)} · p95 ${formatDuration(summary.p95)}`
          : "Traces per duration bucket."
      }
      actions={
        <DurationScaleToggle value={scale} onValueChange={setScale} label="Histogram bucket scale" />
      }
      refreshing={refreshing}
    >
      <Histogram
        buckets={buckets}
        total={summary.count}
        height={HISTOGRAM_HEIGHT}
        formatBoundary={formatDurationTick}
        formatCount={formatCount}
        describeBucket={describeDurationBucket}
        countNoun={TRACE_NOUN}
        overflowCaption={
          overflow
            ? `The last bar gathers the ${formatCount(overflow.count)} slowest ${overflow.count === 1 ? "trace" : "traces"} (${describeDurationBucket(overflow)}); the log scale spreads them out.`
            : undefined
        }
        emptyMessage={EMPTY_MESSAGE}
        label={`Histogram of ${summary.count} trace durations on ${scale} buckets`}
      />
    </TraceTileCard>
  );
}

/** Every trace by start time and duration; hovering one highlights its operation's other traces. */
export function DurationScatterTile({
  traces,
  summary,
  timeWindow,
  refreshing,
}: TraceTileProps): ReactElement {
  const [scale, setScale] = useState<HistogramScaleId>("linear");

  const traces_by_id: Map<string, ServerTraceRow> = useMemo(
    (): Map<string, ServerTraceRow> =>
      new Map(traces.map((trace: ServerTraceRow): [string, ServerTraceRow] => [trace.event_id, trace])),
    [traces],
  );

  const series: ScatterPlotSeries[] = useMemo(
    (): ScatterPlotSeries[] => [
      {
        id: "traces",
        label: "Traces",
        points: traces.map((trace: ServerTraceRow) => ({
          id: trace.event_id,
          x: trace.start_time,
          y: traceDurationMs(trace),
          label: trace.op_name,
          // Hovering a trace keeps its operation's other traces opaque.
          group: trace.op_name,
        })),
      },
    ],
    [traces],
  );

  const from: number = Math.min(timeWindow.from, timeWindow.to);
  const to: number = Math.max(timeWindow.from, timeWindow.to);
  // A single instant still gets a readable axis: pad it by a second.
  const x_min: number = to > from ? from : from - 1_000;
  const x_max: number = to > from ? to : to + 1_000;
  const x_ticks: number[] = useMemo(
    (): number[] => timeTicks(x_min, x_max, 5),
    [x_min, x_max],
  );
  const formatXTick = useCallback(
    (x: number): string => formatTimeTick(x, x_max - x_min),
    [x_min, x_max],
  );

  const references: ScatterPlotReferenceLine[] = useMemo(
    (): ScatterPlotReferenceLine[] =>
      summary.count > 0
        ? [
            { value: summary.p50, label: `p50 · ${formatDuration(summary.p50)}` },
            { value: summary.p95, label: `p95 · ${formatDuration(summary.p95)}` },
          ]
        : [],
    [summary.count, summary.p50, summary.p95],
  );

  const formatTooltip = useCallback(
    ({ point }: ScatterPlotTooltipContext): ReactNode => {
      const trace: ServerTraceRow | undefined =
        point.id === undefined ? undefined : traces_by_id.get(point.id);
      return (
        <>
          <ChartTooltipRow value={formatDuration(point.y)} label="duration" />
          {trace ? (
            <div className="max-w-64 whitespace-normal">
              <div className="mt-0.5 break-words font-mono">{trace.op_name}</div>
              <div className="text-muted-foreground">
                {getTraceCategoryLabel(trace.op_category)} · {formatInstant(trace.start_time)}
              </div>
            </div>
          ) : null}
        </>
      );
    },
    [traces_by_id],
  );

  return (
    <TraceTileCard
      tile={TRACE_TILES["duration-scatter"]}
      description="Hover a point to read its trace and highlight its operation's other traces."
      actions={
        <DurationScaleToggle value={scale} onValueChange={setScale} label="Scatter plot duration axis scale" />
      }
      refreshing={refreshing}
    >
      <ScatterPlot
        series={series}
        width="auto"
        height={SCATTER_HEIGHT}
        xMin={x_min}
        xMax={x_max}
        yScale={scale}
        // Linear: 0 up to a nice ceiling. Log: whole decades from 1 ms, the
        // durations' resolution (0 ms traces sit on the 1 ms line).
        yMin={scale === "log" ? 1 : 0}
        yMax={scale === "log" ? undefined : niceAxisTop(summary.max, 4, 1)}
        formatX={formatTraceStart}
        formatY={formatDuration}
        xTickValues={x_ticks}
        xTickFormatter={formatXTick}
        yTickFormatter={formatDurationTick}
        niceTicks
        gridLineCount={4}
        yTickLabelWidth={48}
        yReferenceLines={references}
        formatTooltip={formatTooltip}
        emptyMessage={EMPTY_MESSAGE}
        label={`Scatter plot of ${summary.count} traces by start time and duration`}
      />
    </TraceTileCard>
  );
}
