"use client";

import type { ReactElement, ReactNode } from "react";
import { cn } from "@schemavaults/ui";
import { niceStep } from "../trace-analytics";

/**
 * Small SVG building blocks shared by the trace dashboard charts. Marks and
 * text use theme tokens (`stroke-border`, `fill-muted-foreground`, …) so the
 * charts follow the light/dark theme; data colors come from the
 * `--trace-series-*` custom properties.
 */

export interface Scale {
  (value: number): number;
  domain: readonly [number, number];
}

/** Maps [d0, d1] onto [r0, r1]; a zero-width domain maps to the range start. */
export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span: number = d1 - d0;
  const scale = ((value: number): number =>
    span === 0 ? r0 : r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  scale.domain = domain;
  return scale;
}

/** SVG path of a bar with rounded top corners and a square base. */
export function roundedTopBarPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number = 4,
): string {
  if (width <= 0 || height <= 0) {
    return "";
  }
  const r: number = Math.max(0, Math.min(radius, width / 2, height));
  const bottom: number = y + height;
  return [
    `M${x},${bottom}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${bottom}`,
    "Z",
  ].join(" ");
}

export interface HorizontalGridProps {
  ticks: readonly number[];
  y: (value: number) => number;
  x0: number;
  x1: number;
  format: (value: number) => string;
}

/** Hairline gridlines with right-aligned tick labels in the left gutter. */
export function HorizontalGrid({
  ticks,
  y,
  x0,
  x1,
  format,
}: HorizontalGridProps): ReactElement {
  return (
    <g aria-hidden="true" className="pointer-events-none select-none">
      {ticks.map(
        (tick: number): ReactElement => (
          <g key={tick}>
            <line
              x1={x0}
              x2={x1}
              y1={y(tick)}
              y2={y(tick)}
              strokeWidth={1}
              className="stroke-border"
            />
            <text
              x={x0 - 6}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="central"
              className="fill-muted-foreground tabular-nums"
            >
              {format(tick)}
            </text>
          </g>
        ),
      )}
    </g>
  );
}

export interface ChartTooltipProps {
  /** Anchor point in container pixels (the tooltip sits above it). */
  x: number;
  y: number;
  /** Width of the chart container, to keep the tooltip inside it. */
  containerWidth: number;
  children: ReactNode;
  className?: string;
}

const TOOLTIP_HALF_WIDTH: number = 128;

/**
 * A floating readout above a chart position: the value leads, labels follow.
 * Flips below the anchor near the top edge and clamps horizontally.
 */
export function ChartTooltip({
  x,
  y,
  containerWidth,
  children,
  className,
}: ChartTooltipProps): ReactElement {
  const left: number = Math.min(
    Math.max(x, TOOLTIP_HALF_WIDTH),
    Math.max(TOOLTIP_HALF_WIDTH, containerWidth - TOOLTIP_HALF_WIDTH),
  );
  const below: boolean = y < 72;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "bg-popover text-popover-foreground pointer-events-none absolute z-10 w-max max-w-[16rem] -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-xs shadow-md",
        below ? "translate-y-3" : "-translate-y-full -mt-3",
        className,
      )}
      style={{ left, top: y }}
    >
      {children}
    </div>
  );
}

export interface TooltipRowProps {
  /** Short line key in the series color; omitted for single-series charts. */
  color?: string;
  label: ReactNode;
  value: ReactNode;
}

/** One `value · label` line of a tooltip, keyed by a short stroke of the series color. */
export function TooltipRow({ color, label, value }: TooltipRowProps): ReactElement {
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      {color ? (
        <span
          aria-hidden="true"
          className="inline-block h-0.5 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: color }}
        />
      ) : null}
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground truncate">{label}</span>
    </div>
  );
}

/** Evenly spaced indices (always including the first and last) so at most `max_labels` labels render. */
export function thinIndices(count: number, max_labels: number): number[] {
  if (count <= 0) {
    return [];
  }
  if (count <= max_labels) {
    return Array.from({ length: count }, (_, index: number): number => index);
  }
  const step: number = Math.ceil((count - 1) / Math.max(1, max_labels - 1));
  const indices: number[] = [];
  for (let index = 0; index < count - 1; index += step) {
    indices.push(index);
  }
  if (count - 1 - indices[indices.length - 1]! < step / 2 && indices.length > 1) {
    indices.pop();
  }
  indices.push(count - 1);
  return indices;
}

/**
 * A zero-based value axis: nice ticks from 0 up to the first tick at or
 * above `max` (at least `min_step`, e.g. 1 for whole counts).
 */
export function niceAxis(
  max: number,
  target: number = 4,
  min_step: number = 1,
): { ticks: number[]; top: number } {
  const step: number = niceStep(Math.max(0, max) / Math.max(1, target), min_step);
  const top: number = Math.max(step, Math.ceil(Math.max(0, max) / step) * step);
  const ticks: number[] = [];
  for (let value = 0; value <= top + step * 1e-9; value += step) {
    ticks.push(Number(value.toPrecision(12)));
  }
  return { ticks, top };
}
