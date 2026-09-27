"use client";

import { useCallback, useMemo, type ReactElement } from "react";
import { LineChart, type LineChartPoint, type LineChartSeries } from "@schemavaults/ui";
import { TRACE_TILES } from "../tiles";
import {
  buildTimeSeries,
  niceAxisTop,
  timeTicks,
  type TimeBucket,
  type TimeSeries,
} from "../trace-analytics";
import {
  formatCount,
  formatDuration,
  formatDurationTick,
  formatInstant,
  formatSpan,
  formatTimeTick,
} from "../format";
import { TraceTileCard } from "./TraceTileCard";
import type { TraceTileProps } from "./tile-props";

const CHART_HEIGHT: number = 220;

interface TimeLineDefinition {
  id: string;
  label: string;
  /** The line's value in a bucket; non-finite values leave a gap. */
  value: (bucket: TimeBucket) => number;
  /** Wash the area under the line (single-series charts). */
  area?: boolean;
}

const LATENCY_LINES: readonly TimeLineDefinition[] = [
  { id: "p50", label: "Median (p50)", value: (bucket: TimeBucket): number => bucket.p50 },
  { id: "p95", label: "p95", value: (bucket: TimeBucket): number => bucket.p95 },
];

const THROUGHPUT_LINES: readonly TimeLineDefinition[] = [
  { id: "count", label: "traces", value: (bucket: TimeBucket): number => bucket.count, area: true },
];

/** A value with no value on either side draws no line segment: only a point marker shows it. */
function hasIsolatedPoints(points: readonly LineChartPoint[]): boolean {
  return points.some(
    (point: LineChartPoint, index: number): boolean =>
      Number.isFinite(point.y) &&
      !Number.isFinite(points[index - 1]?.y ?? NaN) &&
      !Number.isFinite(points[index + 1]?.y ?? NaN),
  );
}

interface TimeLineChartProps {
  series: TimeSeries;
  lines: readonly TimeLineDefinition[];
  /** Tooltip value format. */
  formatValue: (value: number) => string;
  /** Y-axis tick format. */
  formatTick: (value: number) => string;
  label: string;
}

/** Bucketed values over time as lines on one zero-based axis, spanning the whole time window. */
function TimeLineChart({
  series,
  lines,
  formatValue,
  formatTick,
  label,
}: TimeLineChartProps): ReactElement {
  const { buckets } = series;

  const chart_series: LineChartSeries[] = useMemo(
    (): LineChartSeries[] =>
      lines.map((line: TimeLineDefinition): LineChartSeries => {
        const points: LineChartPoint[] = buckets.map(
          (bucket: TimeBucket): LineChartPoint => ({
            id: String(bucket.start),
            // Each bucket's value sits at the bucket's midpoint.
            x: (bucket.start + bucket.end) / 2,
            y: line.value(bucket),
            label: `from ${formatInstant(bucket.start, false)}`,
          }),
        );
        return {
          id: line.id,
          label: line.label,
          points,
          area: line.area,
          showPoints: hasIsolatedPoints(points),
        };
      }),
    [buckets, lines],
  );

  const x_min: number = buckets[0]?.start ?? 0;
  const x_max: number = buckets[buckets.length - 1]?.end ?? 1;
  const x_ticks: number[] = useMemo(
    (): number[] => timeTicks(x_min, x_max, 5),
    [x_min, x_max],
  );
  const formatXTick = useCallback(
    (x: number): string => formatTimeTick(x, x_max - x_min),
    [x_min, x_max],
  );
  const max_value: number = Math.max(
    0,
    ...chart_series.flatMap((line: LineChartSeries): number[] =>
      line.points.map((point: LineChartPoint): number => point.y).filter(Number.isFinite),
    ),
  );

  return (
    <LineChart
      series={chart_series}
      width="auto"
      height={CHART_HEIGHT}
      xMin={x_min}
      xMax={x_max}
      yMin={0}
      yMax={niceAxisTop(max_value, 4, 1)}
      formatY={formatValue}
      yTickFormatter={formatTick}
      niceTicks
      gridLineCount={4}
      yTickLabelWidth={48}
      xTickValues={x_ticks}
      xTickFormatter={formatXTick}
      label={label}
    />
  );
}

function useTimeSeries(props: TraceTileProps): TimeSeries {
  const { traces, timeWindow } = props;
  return useMemo(
    (): TimeSeries => buildTimeSeries(traces, timeWindow),
    [traces, timeWindow],
  );
}

/** Median and p95 duration per time bucket: spot latency regressions and spikes. */
export function LatencyOverTimeTile(props: TraceTileProps): ReactElement {
  const series: TimeSeries = useTimeSeries(props);
  return (
    <TraceTileCard
      tile={TRACE_TILES["latency-over-time"]}
      description={`Duration percentiles per ${formatSpan(series.bucket_ms)} bucket; gaps are buckets without traces.`}
      refreshing={props.refreshing}
    >
      <TimeLineChart
        series={series}
        lines={LATENCY_LINES}
        formatValue={formatDuration}
        formatTick={formatDurationTick}
        label={`Median and p95 trace duration per ${formatSpan(series.bucket_ms)}`}
      />
    </TraceTileCard>
  );
}

/** Traces recorded per time bucket. */
export function ThroughputTile(props: TraceTileProps): ReactElement {
  const series: TimeSeries = useTimeSeries(props);
  const peak: TimeBucket | undefined = series.buckets.reduce<TimeBucket | undefined>(
    (current, bucket) => (!current || bucket.count > current.count ? bucket : current),
    undefined,
  );
  return (
    <TraceTileCard
      tile={TRACE_TILES.throughput}
      description={
        peak && peak.count > 0
          ? `Traces per ${formatSpan(series.bucket_ms)} bucket · peak ${formatCount(peak.count)}`
          : `Traces per ${formatSpan(series.bucket_ms)} bucket.`
      }
      refreshing={props.refreshing}
    >
      <TimeLineChart
        series={series}
        lines={THROUGHPUT_LINES}
        formatValue={formatCount}
        formatTick={formatCount}
        label={`Traces recorded per ${formatSpan(series.bucket_ms)}`}
      />
    </TraceTileCard>
  );
}
