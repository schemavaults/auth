"use client";

import {
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import type { DurationBucket } from "../trace-analytics";
import { formatCount, formatDuration, formatDurationTick, formatShare } from "../format";
import {
  ChartTooltip,
  HorizontalGrid,
  TooltipRow,
  linearScale,
  niceAxis,
  roundedTopBarPath,
  thinIndices,
} from "./chart-primitives";

export interface DurationHistogramProps {
  buckets: readonly DurationBucket[];
  /** Traces in the sample, for each bucket's share. */
  total: number;
  width: number;
  height?: number;
  /** Bar color (a CSS color, e.g. a `--trace-series-*` variable). */
  color: string;
  /** Color of the open-ended overflow bucket, set apart from the regular bins. */
  overflowColor: string;
  /** Accessible name of the chart. */
  label: string;
}

const MARGIN = { top: 16, right: 8, bottom: 24, left: 44 } as const;
/** The surface gap between touching bars. */
const BAR_GAP: number = 2;
/** Room each x-axis label needs before labels start thinning out. */
const X_LABEL_SPACING: number = 52;

export function describeBucket(bucket: DurationBucket): string {
  if (bucket.upper === null) {
    return `${formatDuration(bucket.lower)} or more`;
  }
  if (bucket.lower === 0 && bucket.upper === 1) {
    return "under 1 ms";
  }
  if (bucket.upper - bucket.lower === 1) {
    return formatDuration(bucket.lower);
  }
  return `${formatDuration(bucket.lower)} – ${formatDuration(bucket.upper)}`;
}

/**
 * A duration histogram: one column per bucket on a shared count axis, with
 * bucket boundaries labelled along the x-axis. Hover or arrow keys read out
 * a bucket; the tallest bucket is labelled directly.
 */
export function DurationHistogram({
  buckets,
  total,
  width,
  height = 240,
  color,
  overflowColor,
  label,
}: DurationHistogramProps): ReactElement {
  const [active, setActive] = useState<number | null>(null);

  const plotX0: number = MARGIN.left;
  const plotX1: number = Math.max(plotX0 + 1, width - MARGIN.right);
  const plotY0: number = MARGIN.top;
  const plotY1: number = Math.max(plotY0 + 1, height - MARGIN.bottom);
  const slot: number = buckets.length > 0 ? (plotX1 - plotX0) / buckets.length : 0;

  const layout = useMemo(() => {
    const max_count: number = Math.max(0, ...buckets.map((b) => b.count));
    const axis = niceAxis(max_count, 4, 1);
    const y = linearScale([0, axis.top], [plotY1, plotY0]);
    const mode_index: number = buckets.findIndex((b) => b.count === max_count);

    // Boundaries: the lower edge of every bucket plus the closing upper edge
    // (the open-ended overflow bucket has none).
    const boundaries: { x: number; value: number }[] = buckets.map(
      (bucket: DurationBucket, index: number) => ({
        x: plotX0 + index * slot,
        value: bucket.lower,
      }),
    );
    const last: DurationBucket | undefined = buckets[buckets.length - 1];
    if (last && last.upper !== null) {
      boundaries.push({ x: plotX0 + buckets.length * slot, value: last.upper });
    }
    const max_labels: number = Math.max(2, Math.floor((plotX1 - plotX0) / X_LABEL_SPACING));
    const labelled = thinIndices(boundaries.length, max_labels).map(
      (index: number) => boundaries[index]!,
    );

    return { axis, y, mode_index, labelled };
  }, [buckets, plotX0, plotX1, plotY0, plotY1, slot]);

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>): void => {
    if (buckets.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step: number = event.key === "ArrowRight" ? 1 : -1;
      setActive((current: number | null): number =>
        current === null
          ? 0
          : Math.min(buckets.length - 1, Math.max(0, current + step)),
      );
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const active_bucket: DurationBucket | undefined =
    active === null ? undefined : buckets[active];
  const last_bucket: DurationBucket | undefined = buckets[buckets.length - 1];
  const overflow: DurationBucket | undefined =
    last_bucket && last_bucket.upper === null ? last_bucket : undefined;

  return (
    <div className="w-full">
      <div className="relative w-full" style={{ height }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${label}. Use the arrow keys to read each bucket.`}
          tabIndex={buckets.length > 0 ? 0 : -1}
          onKeyDown={onKeyDown}
          onBlur={(): void => setActive(null)}
          onPointerLeave={(): void => setActive(null)}
          className="block overflow-visible text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <HorizontalGrid
            ticks={layout.axis.ticks}
            y={layout.y}
            x0={plotX0}
            x1={plotX1}
            format={formatCount}
          />

          {buckets.map((bucket: DurationBucket, index: number): ReactElement => {
            const top: number = layout.y(bucket.count);
            const x: number = plotX0 + index * slot + BAR_GAP / 2;
            const dimmed: boolean = active !== null && active !== index;
            return (
              <path
                key={`${bucket.lower}-${bucket.upper}`}
                d={roundedTopBarPath(x, top, Math.max(0, slot - BAR_GAP), plotY1 - top)}
                style={{ fill: bucket.upper === null ? overflowColor : color }}
                className={dimmed ? "opacity-50 transition-opacity" : "transition-opacity"}
              />
            );
          })}

          {buckets.length > 0 && layout.mode_index >= 0 ? (
            <text
              // The first column's label starts at the bar instead of
              // running into the y-axis ticks.
              x={
                layout.mode_index === 0
                  ? plotX0 + BAR_GAP / 2
                  : plotX0 + (layout.mode_index + 0.5) * slot
              }
              y={layout.y(buckets[layout.mode_index]!.count) - 5}
              textAnchor={layout.mode_index === 0 ? "start" : "middle"}
              className="fill-foreground pointer-events-none select-none font-medium tabular-nums"
            >
              {formatCount(buckets[layout.mode_index]!.count)}
            </text>
          ) : null}

          <line
            x1={plotX0}
            x2={plotX1}
            y1={plotY1}
            y2={plotY1}
            strokeWidth={1}
            className="stroke-muted-foreground/50"
          />
          <g aria-hidden="true" className="pointer-events-none select-none">
            {layout.labelled.map(({ x, value }): ReactElement => (
              <text
                key={`${x}-${value}`}
                x={x}
                y={plotY1 + 15}
                textAnchor="middle"
                className="fill-muted-foreground tabular-nums"
              >
                {formatDurationTick(value)}
              </text>
            ))}
          </g>

          {/* Hit areas: the whole column, not just the painted bar. */}
          {buckets.map((bucket: DurationBucket, index: number): ReactElement => (
            <rect
              key={`hit-${bucket.lower}-${bucket.upper}`}
              x={plotX0 + index * slot}
              y={plotY0}
              width={Math.max(0, slot)}
              height={plotY1 - plotY0}
              fill="transparent"
              onPointerEnter={(): void => setActive(index)}
            />
          ))}

          {buckets.length === 0 ? (
            <text
              x={width / 2}
              y={height / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className="fill-muted-foreground text-sm"
            >
              No traces match the filters
            </text>
          ) : null}
        </svg>

        {active_bucket && active !== null ? (
          <ChartTooltip
            x={plotX0 + (active + 0.5) * slot}
            y={layout.y(active_bucket.count)}
            containerWidth={width}
          >
            <TooltipRow
              value={`${formatCount(active_bucket.count)} ${active_bucket.count === 1 ? "trace" : "traces"}`}
              label={formatShare(total > 0 ? active_bucket.count / total : 0)}
            />
            <div className="text-muted-foreground mt-0.5">{describeBucket(active_bucket)}</div>
          </ChartTooltip>
        ) : null}
      </div>

      {overflow ? (
        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: overflowColor }}
          />
          The last bar gathers the {formatCount(overflow.count)} slowest{" "}
          {overflow.count === 1 ? "trace" : "traces"} ({describeBucket(overflow)}); the log scale spreads
          them out.
        </p>
      ) : null}

      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">Duration</th>
            <th scope="col">Traces</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((bucket: DurationBucket): ReactElement => (
            <tr key={`row-${bucket.lower}-${bucket.upper}`}>
              <td>{describeBucket(bucket)}</td>
              <td>{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default DurationHistogram;
