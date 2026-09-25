"use client";

import {
  memo,
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import {
  timeTicks,
  traceDurationMs,
  type HistogramScaleId,
  type TraceSample,
} from "../trace-analytics";
import {
  formatDuration,
  formatDurationTick,
  formatInstant,
  formatTimeTick,
} from "../format";
import { getTraceCategoryLabel } from "../trace-categories";
import {
  ChartTooltip,
  HorizontalGrid,
  TooltipRow,
  linearScale,
  niceAxis,
} from "./chart-primitives";

export interface DurationScatterReference {
  label: string;
  value: number;
}

export interface DurationScatterProps {
  traces: readonly TraceSample[];
  /** Time window of the x-axis (Unix epoch ms). */
  timeWindow: { from: number; to: number };
  scale: HistogramScaleId;
  width: number;
  height?: number;
  /** Marker color (a CSS color, e.g. a `--trace-series-*` variable). */
  color: string;
  /** Horizontal reference lines, e.g. the sample's p50 and p95. */
  references?: readonly DurationScatterReference[];
  /** Called when a point is clicked, with its operation name. */
  onSelectOperation?: (op_name: string) => void;
  label: string;
}

const MARGIN = { top: 12, right: 12, bottom: 24, left: 48 } as const;
/** How close (px) the pointer must be to a point to read it out. */
const HIT_RADIUS: number = 24;
const POINT_RADIUS: number = 4;

interface PlacedPoint {
  trace: TraceSample;
  duration: number;
  x: number;
  y: number;
}

/** Log axis floor: 0 ms durations sit on the 1 ms line. */
function log10Duration(ms: number): number {
  return Math.log10(Math.max(1, ms));
}

interface PointsLayerProps {
  points: readonly PlacedPoint[];
  color: string;
  /** Operation whose points stay opaque while the others fade. */
  emphasized_op: string | null;
}

/** The markers, memoized so moving the pointer only re-renders the readout. */
const PointsLayer = memo(function PointsLayer({
  points,
  color,
  emphasized_op,
}: PointsLayerProps): ReactElement {
  return (
    <g aria-hidden="true">
      {points.map((point: PlacedPoint): ReactElement => {
        const faded: boolean =
          emphasized_op !== null && point.trace.op_name !== emphasized_op;
        return (
          <circle
            key={point.trace.event_id}
            cx={point.x}
            cy={point.y}
            r={POINT_RADIUS}
            style={{ fill: color }}
            fillOpacity={faded ? 0.12 : 0.75}
            strokeWidth={1}
            className="stroke-card"
          />
        );
      })}
    </g>
  );
});

/**
 * Every trace as a point: start time across, duration up. The nearest point
 * within reach of the pointer is read out and its operation's other traces
 * stay emphasized while the rest fade; clicking selects that operation.
 */
export function DurationScatter({
  traces,
  timeWindow,
  scale,
  width,
  height = 260,
  color,
  references = [],
  onSelectOperation,
  label,
}: DurationScatterProps): ReactElement {
  const [active, setActive] = useState<number | null>(null);

  const plotX0: number = MARGIN.left;
  const plotX1: number = Math.max(plotX0 + 1, width - MARGIN.right);
  const plotY0: number = MARGIN.top;
  const plotY1: number = Math.max(plotY0 + 1, height - MARGIN.bottom);

  const layout = useMemo(() => {
    const durations: number[] = traces.map(traceDurationMs);
    const max_duration: number = Math.max(0, ...durations);

    // Linear: 0 up to a nice ceiling. Log: whole decades from 1 ms.
    const y_ticks: number[] =
      scale === "log"
        ? Array.from(
            { length: Math.max(1, Math.ceil(log10Duration(max_duration))) + 1 },
            (_, decade: number): number => 10 ** decade,
          )
        : niceAxis(max_duration, 4, 1).ticks;
    const y_top: number = y_ticks[y_ticks.length - 1]!;
    const y =
      scale === "log"
        ? ((): ((ms: number) => number) => {
            const project = linearScale([0, log10Duration(y_top)], [plotY1, plotY0]);
            return (ms: number): number => project(log10Duration(ms));
          })()
        : linearScale([0, y_top], [plotY1, plotY0]);

    const from: number = Math.min(timeWindow.from, timeWindow.to);
    const to: number = Math.max(timeWindow.from, timeWindow.to);
    // A single instant still gets a readable axis: pad it by a second.
    const x_domain: [number, number] = to > from ? [from, to] : [from - 1_000, to + 1_000];
    const x = linearScale(x_domain, [plotX0, plotX1]);
    const x_ticks: number[] = timeTicks(x_domain[0], x_domain[1], Math.max(2, Math.floor((plotX1 - plotX0) / 110)));

    const points: PlacedPoint[] = traces.map(
      (trace: TraceSample, index: number): PlacedPoint => ({
        trace,
        duration: durations[index]!,
        x: x(trace.start_time),
        y: y(durations[index]!),
      }),
    );
    // Keyboard order: left to right.
    const by_time: number[] = points
      .map((_, index: number): number => index)
      .sort((a: number, b: number): number => points[a]!.x - points[b]!.x);

    return { x, y, y_ticks, x_ticks, x_domain, points, by_time };
  }, [traces, scale, timeWindow.from, timeWindow.to, plotX0, plotX1, plotY0, plotY1]);

  const operations_count: number = useMemo(
    (): number => new Set(traces.map((trace) => trace.op_name)).size,
    [traces],
  );

  const active_point: PlacedPoint | undefined =
    active === null ? undefined : layout.points[active];
  const emphasized_op: string | null =
    active_point && operations_count > 1 ? active_point.trace.op_name : null;

  const onPointerMove = (event: PointerEvent<SVGRectElement>): void => {
    const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!bounds) return;
    const px: number = event.clientX - bounds.left;
    const py: number = event.clientY - bounds.top;
    let nearest: number | null = null;
    let nearest_distance: number = HIT_RADIUS * HIT_RADIUS;
    layout.points.forEach((point: PlacedPoint, index: number): void => {
      const distance: number = (point.x - px) ** 2 + (point.y - py) ** 2;
      if (distance <= nearest_distance) {
        nearest = index;
        nearest_distance = distance;
      }
    });
    setActive(nearest);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>): void => {
    const order: number[] = layout.by_time;
    if (order.length === 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const position: number = active === null ? -1 : order.indexOf(active);
      const next: number =
        event.key === "ArrowRight"
          ? Math.min(order.length - 1, position + 1)
          : Math.max(0, position - 1);
      setActive(order[next]!);
    } else if (event.key === "Enter" && active_point && onSelectOperation) {
      event.preventDefault();
      onSelectOperation(active_point.trace.op_name);
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const span: number = layout.x_domain[1] - layout.x_domain[0];

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}. Use the arrow keys to read traces in time order${onSelectOperation ? " and Enter to filter by the trace's operation" : ""}.`}
        tabIndex={traces.length > 0 ? 0 : -1}
        onKeyDown={onKeyDown}
        onBlur={(): void => setActive(null)}
        className="block overflow-visible text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        <HorizontalGrid
          ticks={layout.y_ticks}
          y={layout.y}
          x0={plotX0}
          x1={plotX1}
          format={formatDurationTick}
        />
        <g aria-hidden="true" className="pointer-events-none select-none">
          {layout.x_ticks.map((tick: number): ReactElement => (
            <text
              key={tick}
              x={layout.x(tick)}
              y={plotY1 + 15}
              textAnchor="middle"
              className="fill-muted-foreground tabular-nums"
            >
              {formatTimeTick(tick, span)}
            </text>
          ))}
        </g>

        <PointsLayer points={layout.points} color={color} emphasized_op={emphasized_op} />

        {traces.length > 0
          ? references.map((reference: DurationScatterReference): ReactElement => {
              const y: number = layout.y(reference.value);
              return (
                <g key={reference.label} aria-hidden="true" className="pointer-events-none select-none">
                  <line
                    x1={plotX0}
                    x2={plotX1}
                    y1={y}
                    y2={y}
                    strokeWidth={1}
                    strokeDasharray="4 3"
                    className="stroke-muted-foreground/70"
                  />
                  <text
                    x={plotX1 - 4}
                    y={y - 4}
                    textAnchor="end"
                    // A halo in the surface color keeps the label legible over dense points.
                    paintOrder="stroke"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    className="fill-muted-foreground stroke-card"
                  >
                    {reference.label} · {formatDuration(reference.value)}
                  </text>
                </g>
              );
            })
          : null}

        {active_point ? (
          <circle
            cx={active_point.x}
            cy={active_point.y}
            r={POINT_RADIUS + 2}
            strokeWidth={2}
            className="fill-none stroke-foreground pointer-events-none"
          />
        ) : null}

        <rect
          x={plotX0 - POINT_RADIUS}
          y={plotY0 - POINT_RADIUS}
          width={Math.max(0, plotX1 - plotX0 + 2 * POINT_RADIUS)}
          height={Math.max(0, plotY1 - plotY0 + 2 * POINT_RADIUS)}
          fill="transparent"
          onPointerMove={onPointerMove}
          onPointerLeave={(): void => setActive(null)}
          onClick={(): void => {
            if (active_point && onSelectOperation) {
              onSelectOperation(active_point.trace.op_name);
            }
          }}
          className={active_point && onSelectOperation ? "cursor-pointer" : undefined}
        />

        {traces.length === 0 ? (
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

      {active_point ? (
        <ChartTooltip x={active_point.x} y={active_point.y} containerWidth={width}>
          <TooltipRow value={formatDuration(active_point.duration)} label="duration" />
          <div className="mt-0.5 break-words font-mono">{active_point.trace.op_name}</div>
          <div className="text-muted-foreground">
            {getTraceCategoryLabel(active_point.trace.op_category)} · {formatInstant(active_point.trace.start_time)}
          </div>
          {onSelectOperation ? (
            <div className="text-muted-foreground mt-1 italic">Click to filter by this operation</div>
          ) : null}
        </ChartTooltip>
      ) : null}
    </div>
  );
}

export default DurationScatter;
