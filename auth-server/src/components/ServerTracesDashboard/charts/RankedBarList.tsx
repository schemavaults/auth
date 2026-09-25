"use client";

import type { ReactElement, ReactNode } from "react";
import { cn } from "@schemavaults/ui";

export interface RankedBarItem {
  id: string;
  label: string;
  value: number;
  /** Formatted value shown at the end of the row. */
  valueLabel: ReactNode;
  /** Secondary detail under the label (e.g. the trace count). */
  detail?: ReactNode;
}

export interface RankedBarListProps {
  items: readonly RankedBarItem[];
  /** Bar color (a CSS color, e.g. a `--trace-series-*` variable). */
  color: string;
  /** Row click handler; rows render as buttons when set. */
  onSelect?: (item: RankedBarItem) => void;
  /** Ids rendered as selected (e.g. operations already in the filter). */
  selectedIds?: readonly string[];
  emptyMessage?: string;
  label: string;
}

/**
 * Horizontal bars on one shared scale, one row per item, for rankings whose
 * labels are too long for an SVG axis gutter (operation names). The value
 * sits at the end of each row; bars stay thin.
 */
export function RankedBarList({
  items,
  color,
  onSelect,
  selectedIds = [],
  emptyMessage = "No traces match the filters",
  label,
}: RankedBarListProps): ReactElement {
  const max: number = Math.max(0, ...items.map((item) => item.value));

  if (items.length === 0) {
    return (
      <p className="text-muted-foreground flex min-h-32 items-center justify-center text-sm">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-1" aria-label={label}>
      {items.map((item: RankedBarItem): ReactElement => {
        const fraction: number = max > 0 ? item.value / max : 0;
        const selected: boolean = selectedIds.includes(item.id);
        const content: ReactElement = (
          <>
            <div className="flex w-full min-w-0 items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-mono text-xs" title={item.label}>
                {item.label}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {item.valueLabel}
              </span>
            </div>
            <div className="flex w-full items-center gap-2">
              <div className="h-2 min-w-0 flex-1">
                <div
                  className="h-2 rounded-r-[4px]"
                  style={{
                    width: `${Math.max(fraction * 100, item.value > 0 ? 1 : 0)}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              {item.detail ? (
                <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                  {item.detail}
                </span>
              ) : null}
            </div>
          </>
        );
        return (
          <li key={item.id}>
            {onSelect ? (
              <button
                type="button"
                onClick={(): void => onSelect(item)}
                aria-pressed={selected}
                title={selected ? "Remove this operation from the filter" : "Filter by this operation"}
                className={cn(
                  "hover:bg-muted/60 focus-visible:ring-ring flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2",
                  selected && "bg-muted",
                )}
              >
                {content}
              </button>
            ) : (
              <div className="flex w-full flex-col gap-1 px-2 py-1.5">{content}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default RankedBarList;
