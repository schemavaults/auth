"use client";

import { useMemo, type ReactElement, type ReactNode } from "react";
import {
  Button,
  MultiSelect,
  ToggleGroup,
  ToggleGroupItem,
  type MultiSelectOption,
} from "@schemavaults/ui";
import { RefreshCw, X } from "lucide-react";
import {
  SERVER_TRACE_RANGE_IDS,
  SERVER_TRACE_RANGE_LABELS,
  SERVER_TRACE_SAMPLE_SIZES,
  isServerTraceOpCategory,
  isServerTraceRangeId,
  type ServerTraceFilters,
  type ServerTraceRangeId,
  type ServerTraceSampleSize,
} from "@/lib/server-trace-filters";
import type { ServerTraceOpCategory } from "@/lib/server-trace-schema";
import { formatCount } from "./format";
import { TRACE_CATEGORY_ORDER, getTraceCategoryLabel } from "./trace-categories";
import type { ServerTraceOperation } from "./use-server-traces";

const RANGE_SHORT_LABELS: Record<ServerTraceRangeId, string> = {
  "15m": "15m",
  "1h": "1h",
  "6h": "6h",
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  all: "All",
};

function FilterField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-muted-foreground text-xs font-medium uppercase tracking-wide"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

export interface ServerTracesFilterBarProps {
  filters: ServerTraceFilters;
  onFiltersChange: (filters: ServerTraceFilters) => void;
  /** Operations that recorded traces in the selected range (filter options). */
  operations: readonly ServerTraceOperation[] | undefined;
  refreshing: boolean;
  onRefresh: () => void;
}

/** The one filter row that scopes every tile below it. */
export function ServerTracesFilterBar({
  filters,
  onFiltersChange,
  operations,
  refreshing,
  onRefresh,
}: ServerTracesFilterBarProps): ReactElement {
  const category_options: MultiSelectOption[] = useMemo((): MultiSelectOption[] => {
    const counts = new Map<string, number>();
    for (const op of operations ?? []) {
      counts.set(op.op_category, (counts.get(op.op_category) ?? 0) + op.count);
    }
    return TRACE_CATEGORY_ORDER.map(
      (category: ServerTraceOpCategory): MultiSelectOption => ({
        value: category,
        label: getTraceCategoryLabel(category),
        description: operations
          ? `${formatCount(counts.get(category) ?? 0)} traces`
          : undefined,
      }),
    );
  }, [operations]);

  const operation_options: MultiSelectOption[] = useMemo((): MultiSelectOption[] => {
    const known: MultiSelectOption[] = (operations ?? []).map(
      (op: ServerTraceOperation): MultiSelectOption => ({
        value: op.op_name,
        label: op.op_name,
        description: `${getTraceCategoryLabel(op.op_category)} · ${formatCount(op.count)} traces`,
        keywords: [op.op_category],
      }),
    );
    // Keep selected operations selectable even when the range has none of their traces.
    const missing: MultiSelectOption[] = filters.op_names
      .filter((op_name: string): boolean => !known.some((option) => option.value === op_name))
      .map((op_name: string): MultiSelectOption => ({
        value: op_name,
        label: op_name,
        description: "No traces in this range",
      }));
    return [...known, ...missing];
  }, [operations, filters.op_names]);

  const has_dimension_filters: boolean =
    filters.op_names.length > 0 || filters.op_categories.length > 0;

  return (
    <div
      role="group"
      aria-label="Trace filters"
      className="flex flex-row flex-wrap items-end gap-x-4 gap-y-3"
      data-testid="server-traces-filters"
    >
      <FilterField label="Time range">
        <ToggleGroup
          type="single"
          value={filters.range}
          onValueChange={(next: string): void => {
            if (isServerTraceRangeId(next)) {
              onFiltersChange({ ...filters, range: next });
            }
          }}
          variant="outline"
          size="sm"
          className="flex flex-row flex-wrap gap-1"
          aria-label="Time range"
        >
          {SERVER_TRACE_RANGE_IDS.map(
            (range: ServerTraceRangeId): ReactElement => (
              <ToggleGroupItem
                key={range}
                value={range}
                title={SERVER_TRACE_RANGE_LABELS[range]}
                aria-label={SERVER_TRACE_RANGE_LABELS[range]}
                data-testid={`server-traces-range-${range}`}
              >
                {RANGE_SHORT_LABELS[range]}
              </ToggleGroupItem>
            ),
          )}
        </ToggleGroup>
      </FilterField>

      <FilterField label="Category" htmlFor="server-traces-category-filter">
        <MultiSelect
          id="server-traces-category-filter"
          options={category_options}
          value={filters.op_categories}
          onValueChange={(next: readonly string[]): void =>
            onFiltersChange({
              ...filters,
              op_categories: next.filter(isServerTraceOpCategory),
            })
          }
          placeholder="All categories"
          searchPlaceholder="Search categories…"
          maxDisplay={1}
          size="sm"
          clearable
          className="w-52"
          data-testid="server-traces-category-filter"
        />
      </FilterField>

      <FilterField label="Operation" htmlFor="server-traces-operation-filter">
        <MultiSelect
          id="server-traces-operation-filter"
          options={operation_options}
          value={filters.op_names}
          onValueChange={(next: readonly string[]): void =>
            onFiltersChange({ ...filters, op_names: [...next] })
          }
          placeholder="All operations"
          searchPlaceholder="Search operations…"
          emptyMessage={operations ? "No operations found." : "Loading operations…"}
          maxDisplay={1}
          size="sm"
          clearable
          className="w-72 max-w-full"
          contentClassName="w-[28rem] max-w-[calc(100vw-2rem)]"
          data-testid="server-traces-operation-filter"
        />
      </FilterField>

      <FilterField label="Sample size">
        <ToggleGroup
          type="single"
          value={String(filters.limit)}
          onValueChange={(next: string): void => {
            const limit = Number(next) as ServerTraceSampleSize;
            if ((SERVER_TRACE_SAMPLE_SIZES as readonly number[]).includes(limit)) {
              onFiltersChange({ ...filters, limit });
            }
          }}
          variant="outline"
          size="sm"
          className="flex flex-row gap-1"
          aria-label="Sample size: how many of the most recent matching traces to load"
        >
          {SERVER_TRACE_SAMPLE_SIZES.map(
            (size: ServerTraceSampleSize): ReactElement => (
              <ToggleGroupItem
                key={size}
                value={String(size)}
                title={`Load the ${formatCount(size)} most recent matching traces`}
                data-testid={`server-traces-limit-${size}`}
              >
                {formatCount(size)}
              </ToggleGroupItem>
            ),
          )}
        </ToggleGroup>
      </FilterField>

      <div className="flex flex-row gap-2">
        {has_dimension_filters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={(): void =>
              onFiltersChange({ ...filters, op_names: [], op_categories: [] })
            }
            data-testid="server-traces-clear-filters"
          >
            <X className="mr-1 h-4 w-4" /> Clear filters
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          data-testid="server-traces-refresh"
        >
          <RefreshCw className={refreshing ? "mr-1 h-4 w-4 animate-spin" : "mr-1 h-4 w-4"} />
          Refresh
        </Button>
      </div>
    </div>
  );
}

export default ServerTracesFilterBar;
