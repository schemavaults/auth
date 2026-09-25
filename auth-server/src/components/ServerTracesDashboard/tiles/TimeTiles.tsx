"use client";

import { useMemo, type ReactElement } from "react";
import { TRACE_TILES } from "../tiles";
import { buildTimeSeries, type TimeBucket, type TimeSeries } from "../trace-analytics";
import {
  formatCount,
  formatDuration,
  formatDurationTick,
  formatSpan,
} from "../format";
import { MeasuredChart, TraceTileCard } from "./TraceTileCard";
import { TimeSeriesChart, type TimeSeriesDefinition } from "../charts/TimeSeriesChart";
import type { TraceTileProps } from "./tile-props";

const CHART_HEIGHT: number = 220;
/** The legend row above a multi-series chart. */
const LEGEND_HEIGHT: number = 24;

const LATENCY_SERIES: readonly TimeSeriesDefinition[] = [
  {
    id: "p50",
    label: "Median (p50)",
    color: "var(--trace-series-1)",
    value: (bucket: TimeBucket): number => bucket.p50,
  },
  {
    id: "p95",
    label: "p95",
    color: "var(--trace-series-2)",
    value: (bucket: TimeBucket): number => bucket.p95,
  },
];

const THROUGHPUT_SERIES: readonly TimeSeriesDefinition[] = [
  {
    id: "count",
    label: "traces",
    color: "var(--trace-series-1)",
    value: (bucket: TimeBucket): number => bucket.count,
    area: true,
  },
];

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
      <MeasuredChart height={CHART_HEIGHT + LEGEND_HEIGHT}>
        {(width: number): ReactElement => (
          <TimeSeriesChart
            height={CHART_HEIGHT}
            buckets={series.buckets}
            series={LATENCY_SERIES}
            width={width}
            formatValue={formatDuration}
            formatTick={formatDurationTick}
            label={`Median and p95 trace duration per ${formatSpan(series.bucket_ms)}`}
          />
        )}
      </MeasuredChart>
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
      <MeasuredChart height={CHART_HEIGHT}>
        {(width: number): ReactElement => (
          <TimeSeriesChart
            height={CHART_HEIGHT}
            buckets={series.buckets}
            series={THROUGHPUT_SERIES}
            width={width}
            formatValue={formatCount}
            formatTick={formatCount}
            label={`Traces recorded per ${formatSpan(series.bucket_ms)}`}
          />
        )}
      </MeasuredChart>
    </TraceTileCard>
  );
}
