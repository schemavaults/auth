"use client";

import {
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import { timeTicks, type TimeBucket } from "../trace-analytics";
import { formatInstant, formatTimeTick } from "../format";
import {
  ChartTooltip,
  HorizontalGrid,
  TooltipRow,
  linearScale,
  niceAxis,
} from "./chart-primitives";

export interface TimeSeriesDefinition {
  id: string;
  label: string;
  /** Stroke color (a CSS color, e.g. a `--trace-series-*` variable). */
  color: string;
  /** The series value of a bucket; non-finite values leave a gap. */
  value: (bucket: TimeBucket) => number;
  /** Wash the area under the line (single-series charts). */
  area?: boolean;
}

export interface TimeSeriesChartProps {
  buckets: readonly TimeBucket[];
  series: readonly TimeSeriesDefinition[];
  width: number;
  height?: number;
  /** Tooltip value format. */
  formatValue: (value: number) => string;
  /** Y-axis tick format. */
  formatTick: (value: number) => string;
  /** Smallest y-axis tick step (1 for whole counts and milliseconds). */
  minTickStep?: number;
  label: string;
}

const MARGIN = { top: 12, right: 12, bottom: 24, left: 48 } as const;

interface Segment {
  points: { x: number; y: number }[];
}

/** Splits a series into contiguous runs of finite values. */
function toSegments(
  buckets: readonly TimeBucket[],
  value: (bucket: TimeBucket) => number,
  x: (index: number) => number,
  y: (value: number) => number,
): Segment[] {
  const segments: Segment[] = [];
  let current: Segment | null = null;
  buckets.forEach((bucket: TimeBucket, index: number): void => {
    const v: number = value(bucket);
    if (!Number.isFinite(v)) {
      current = null;
      return;
    }
    if (!current) {
      current = { points: [] };
      segments.push(current);
    }
    current.points.push({ x: x(index), y: y(v) });
  });
  return segments;
}

function linePath(segment: Segment): string {
  return segment.points
    .map((point, index: number): string => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
}

function areaPath(segment: Segment, baseline: number): string {
  const first = segment.points[0]!;
  const last = segment.points[segment.points.length - 1]!;
  return `${linePath(segment)} L${last.x},${baseline} L${first.x},${baseline} Z`;
}

/**
 * Bucketed values over time as lines on one shared axis. A crosshair snaps
 * to the nearest bucket and one readout lists every series there.
 */
export function TimeSeriesChart({
  buckets,
  series,
  width,
  height = 220,
  formatValue,
  formatTick,
  minTickStep = 1,
  label,
}: TimeSeriesChartProps): ReactElement {
  const [active, setActive] = useState<number | null>(null);

  const plotX0: number = MARGIN.left;
  const plotX1: number = Math.max(plotX0 + 1, width - MARGIN.right);
  const plotY0: number = MARGIN.top;
  const plotY1: number = Math.max(plotY0 + 1, height - MARGIN.bottom);

  const layout = useMemo(() => {
    const max_value: number = Math.max(
      0,
      ...buckets.flatMap((bucket: TimeBucket): number[] =>
        series.map((s) => s.value(bucket)).filter(Number.isFinite),
      ),
    );
    const axis = niceAxis(max_value, 4, minTickStep);
    const y = linearScale([0, axis.top], [plotY1, plotY0]);

    const first: TimeBucket | undefined = buckets[0];
    const last: TimeBucket | undefined = buckets[buckets.length - 1];
    const time_domain: [number, number] = first && last ? [first.start, last.end] : [0, 1];
    const time_x = linearScale(time_domain, [plotX0, plotX1]);
    // Each bucket's value sits at the bucket's midpoint.
    const bucket_x = (index: number): number =>
      time_x((buckets[index]!.start + buckets[index]!.end) / 2);
    const x_ticks: number[] = timeTicks(
      time_domain[0],
      time_domain[1],
      Math.max(2, Math.floor((plotX1 - plotX0) / 110)),
    );

    const lines = series.map((definition: TimeSeriesDefinition) => ({
      definition,
      segments: toSegments(buckets, definition.value, bucket_x, y),
    }));

    return { axis, y, time_x, bucket_x, x_ticks, time_domain, lines };
  }, [buckets, series, minTickStep, plotX0, plotX1, plotY0, plotY1]);

  const onPointerMove = (event: PointerEvent<SVGRectElement>): void => {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds || buckets.length === 0) return;
    const px: number = event.clientX - bounds.left;
    let nearest: number = 0;
    let nearest_distance: number = Infinity;
    for (let index = 0; index < buckets.length; index += 1) {
      const distance: number = Math.abs(layout.bucket_x(index) - px);
      if (distance < nearest_distance) {
        nearest = index;
        nearest_distance = distance;
      }
    }
    setActive(nearest);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>): void => {
    if (buckets.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const step: number = event.key === "ArrowRight" ? 1 : -1;
      setActive((current: number | null): number =>
        current === null
          ? buckets.length - 1
          : Math.min(buckets.length - 1, Math.max(0, current + step)),
      );
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const active_bucket: TimeBucket | undefined =
    active === null ? undefined : buckets[active];
  const span: number = layout.time_domain[1] - layout.time_domain[0];
  const active_values = active_bucket
    ? series.map((definition: TimeSeriesDefinition) => ({
        definition,
        value: definition.value(active_bucket),
      }))
    : [];
  const tooltip_y: number = Math.min(
    ...active_values
      .filter(({ value }) => Number.isFinite(value))
      .map(({ value }) => layout.y(value)),
    plotY1,
  );

  return (
    <div className="flex w-full flex-col gap-2">
      {series.length > 1 ? (
        <ul className="text-muted-foreground flex flex-row flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Legend">
          {series.map((definition: TimeSeriesDefinition): ReactElement => (
            <li key={definition.id} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-0.5 w-4 rounded-full"
                style={{ backgroundColor: definition.color }}
              />
              {definition.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="relative w-full" style={{ height }}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${label}. Use the arrow keys to read each time bucket.`}
          tabIndex={buckets.length > 0 ? 0 : -1}
          onKeyDown={onKeyDown}
          onBlur={(): void => setActive(null)}
          className="block overflow-visible text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          <HorizontalGrid
            ticks={layout.axis.ticks}
            y={layout.y}
            x0={plotX0}
            x1={plotX1}
            format={formatTick}
          />
          <g aria-hidden="true" className="pointer-events-none select-none">
            {layout.x_ticks.map((tick: number): ReactElement => (
              <text
                key={tick}
                x={layout.time_x(tick)}
                y={plotY1 + 15}
                textAnchor="middle"
                className="fill-muted-foreground tabular-nums"
              >
                {formatTimeTick(tick, span)}
              </text>
            ))}
          </g>

          {layout.lines.map(({ definition, segments }): ReactElement => (
            <g key={definition.id} aria-hidden="true" className="pointer-events-none">
              {definition.area
                ? segments.map((segment: Segment, index: number): ReactElement => (
                    <path
                      key={`area-${index}`}
                      d={areaPath(segment, plotY1)}
                      style={{ fill: definition.color }}
                      fillOpacity={0.1}
                    />
                  ))
                : null}
              {segments.map((segment: Segment, index: number): ReactElement =>
                segment.points.length === 1 ? (
                  // A lone bucket between gaps has no line to draw: mark it.
                  <circle
                    key={`dot-${index}`}
                    cx={segment.points[0]!.x}
                    cy={segment.points[0]!.y}
                    r={2.5}
                    style={{ fill: definition.color }}
                  />
                ) : (
                  <path
                    key={`line-${index}`}
                    d={linePath(segment)}
                    fill="none"
                    style={{ stroke: definition.color }}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ),
              )}
            </g>
          ))}

          {active !== null && active_bucket ? (
            <g aria-hidden="true" className="pointer-events-none">
              <line
                x1={layout.bucket_x(active)}
                x2={layout.bucket_x(active)}
                y1={plotY0}
                y2={plotY1}
                strokeWidth={1}
                className="stroke-muted-foreground/60"
              />
              {active_values
                .filter(({ value }) => Number.isFinite(value))
                .map(({ definition, value }): ReactElement => (
                  <circle
                    key={definition.id}
                    cx={layout.bucket_x(active)}
                    cy={layout.y(value)}
                    r={4}
                    strokeWidth={2}
                    style={{ fill: definition.color }}
                    className="stroke-card"
                  />
                ))}
            </g>
          ) : null}

          <line
            x1={plotX0}
            x2={plotX1}
            y1={plotY1}
            y2={plotY1}
            strokeWidth={1}
            className="stroke-muted-foreground/50"
          />

          <rect
            x={plotX0}
            y={plotY0}
            width={Math.max(0, plotX1 - plotX0)}
            height={Math.max(0, plotY1 - plotY0)}
            fill="transparent"
            onPointerMove={onPointerMove}
            onPointerLeave={(): void => setActive(null)}
          />
        </svg>

        {active !== null && active_bucket ? (
          <ChartTooltip x={layout.bucket_x(active)} y={tooltip_y} containerWidth={width}>
            {active_values.map(({ definition, value }): ReactElement => (
              <TooltipRow
                key={definition.id}
                color={series.length > 1 ? definition.color : undefined}
                value={Number.isFinite(value) ? formatValue(value) : "—"}
                label={definition.label}
              />
            ))}
            <div className="text-muted-foreground mt-0.5">
              from {formatInstant(active_bucket.start, false)}
            </div>
          </ChartTooltip>
        ) : null}

        <table className="sr-only">
          <caption>{label}</caption>
          <thead>
            <tr>
              <th scope="col">Bucket start</th>
              {series.map((definition: TimeSeriesDefinition): ReactElement => (
                <th key={definition.id} scope="col">
                  {definition.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {buckets.map((bucket: TimeBucket): ReactElement => (
              <tr key={bucket.start}>
                <td>{formatInstant(bucket.start)}</td>
                {series.map((definition: TimeSeriesDefinition): ReactElement => {
                  const value: number = definition.value(bucket);
                  return <td key={definition.id}>{Number.isFinite(value) ? formatValue(value) : "no traces"}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TimeSeriesChart;
