"use client";

import { useMemo, useState, type ReactElement } from "react";
import { TRACE_TILES } from "../tiles";
import {
  buildDurationHistogram,
  traceDurationMs,
  type DurationBucket,
  type HistogramScaleId,
} from "../trace-analytics";
import { formatCount, formatDuration } from "../format";
import { TRACE_ACCENT_COLOR, TRACE_OTHER_COLOR } from "../trace-categories";
import { DurationHistogram } from "../charts/DurationHistogram";
import { DurationScatter } from "../charts/DurationScatter";
import { DurationScaleToggle, MeasuredChart, TraceTileCard } from "./TraceTileCard";
import type { TraceTileProps } from "./tile-props";

const HISTOGRAM_HEIGHT: number = 240;
const SCATTER_HEIGHT: number = 260;

/** How trace durations are distributed, on linear or logarithmic buckets. */
export function DurationHistogramTile({
  traces,
  summary,
  refreshing,
}: TraceTileProps): ReactElement {
  const [scale, setScale] = useState<HistogramScaleId>("linear");
  const buckets: DurationBucket[] = useMemo(
    (): DurationBucket[] => buildDurationHistogram(traces.map(traceDurationMs), scale),
    [traces, scale],
  );

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
      <MeasuredChart height={HISTOGRAM_HEIGHT}>
        {(width: number): ReactElement => (
          <DurationHistogram
            height={HISTOGRAM_HEIGHT}
            buckets={buckets}
            total={summary.count}
            width={width}
            color={TRACE_ACCENT_COLOR}
            overflowColor={TRACE_OTHER_COLOR}
            label={`Histogram of ${summary.count} trace durations on ${scale} buckets`}
          />
        )}
      </MeasuredChart>
    </TraceTileCard>
  );
}

/** Every trace by start time and duration; click a point to filter by its operation. */
export function DurationScatterTile({
  traces,
  summary,
  timeWindow,
  refreshing,
  toggleOperation,
}: TraceTileProps): ReactElement {
  const [scale, setScale] = useState<HistogramScaleId>("linear");
  const references = useMemo(
    () =>
      summary.count > 0
        ? [
            { label: "p50", value: summary.p50 },
            { label: "p95", value: summary.p95 },
          ]
        : [],
    [summary.count, summary.p50, summary.p95],
  );

  return (
    <TraceTileCard
      tile={TRACE_TILES["duration-scatter"]}
      description="Hover a point to see its operation's other traces; click to filter by that operation."
      actions={
        <DurationScaleToggle value={scale} onValueChange={setScale} label="Scatter plot duration axis scale" />
      }
      refreshing={refreshing}
    >
      <MeasuredChart height={SCATTER_HEIGHT}>
        {(width: number): ReactElement => (
          <DurationScatter
            height={SCATTER_HEIGHT}
            traces={traces}
            timeWindow={timeWindow}
            scale={scale}
            width={width}
            color={TRACE_ACCENT_COLOR}
            references={references}
            onSelectOperation={toggleOperation}
            label={`Scatter plot of ${summary.count} traces by start time and duration`}
          />
        )}
      </MeasuredChart>
    </TraceTileCard>
  );
}
