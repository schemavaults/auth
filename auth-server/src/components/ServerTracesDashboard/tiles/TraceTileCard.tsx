"use client";

import type { ReactElement, ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ToggleGroup,
  ToggleGroupItem,
  cn,
} from "@schemavaults/ui";
import { useMeasuredWidth } from "@schemavaults/auth-ui";
import type { TraceTileDescriptor } from "../tiles";
import type { HistogramScaleId } from "../trace-analytics";

export interface TraceTileCardProps {
  tile: TraceTileDescriptor;
  description: ReactNode;
  /** Controls rendered at the end of the header (e.g. a scale toggle). */
  actions?: ReactNode;
  /** Holds the previous render at reduced opacity while new data loads. */
  refreshing: boolean;
  children: ReactNode;
  contentClassName?: string;
}

/** The card every dashboard tile renders in; wide tiles span both grid columns. */
export function TraceTileCard({
  tile,
  description,
  actions,
  refreshing,
  children,
  contentClassName,
}: TraceTileCardProps): ReactElement {
  return (
    <Card
      data-testid={`trace-tile-${tile.id}`}
      className={cn("flex min-w-0 flex-col", tile.wide && "lg:col-span-2")}
    >
      <CardHeader className="flex flex-col gap-1.5 space-y-0">
        <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <CardTitle className="text-base">{tile.label}</CardTitle>
          {actions}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent
        aria-busy={refreshing}
        className={cn(
          "min-w-0 transition-opacity",
          refreshing && "opacity-60",
          contentClassName,
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}

export interface DurationScaleToggleProps {
  value: HistogramScaleId;
  onValueChange: (value: HistogramScaleId) => void;
  label: string;
}

/** Linear / log switch for a duration axis. */
export function DurationScaleToggle({
  value,
  onValueChange,
  label,
}: DurationScaleToggleProps): ReactElement {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next: string): void => {
        // Clicking the active item emits ""; keep the current scale.
        if (next === "linear" || next === "log") {
          onValueChange(next);
        }
      }}
      variant="outline"
      size="sm"
      className="flex shrink-0 flex-row gap-1"
      aria-label={label}
    >
      <ToggleGroupItem value="linear">Linear</ToggleGroupItem>
      <ToggleGroupItem value="log">Log</ToggleGroupItem>
    </ToggleGroup>
  );
}

/**
 * Renders a pixel-sized chart at the current width of its container. Until
 * the container is measured (on the client, right after mount) a placeholder
 * holds the chart's height: the server render never guesses a width, so the
 * chart neither jumps in size nor renders locale-dependent tick labels in
 * the server's time zone.
 */
export function MeasuredChart({
  height,
  children,
}: {
  /** Height of the placeholder shown until the width is known. */
  height: number;
  children: (width: number) => ReactNode;
}): ReactElement {
  const { ref: container_ref, width } = useMeasuredWidth<HTMLDivElement>(0);
  return (
    <div ref={container_ref} className="w-full min-w-0">
      {width > 0 ? children(width) : <div aria-hidden="true" style={{ height }} />}
    </div>
  );
}
