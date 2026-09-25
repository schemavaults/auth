"use client";

import { useMemo, type ReactElement } from "react";
import { Datatable, type ColumnDef } from "@schemavaults/ui";
import { LocalDateTime } from "@schemavaults/auth-ui";
import { TRACE_TILES } from "../tiles";
import type { OperationStats } from "../trace-analytics";
import { formatCount, formatDuration, formatShare } from "../format";
import { getTraceCategoryColor, getTraceCategoryLabel } from "../trace-categories";
import { TraceTileCard } from "./TraceTileCard";
import type { TraceTileProps } from "./tile-props";

function durationColumn(
  id: keyof OperationStats & string,
  header: string,
): ColumnDef<OperationStats> {
  return {
    id,
    accessorKey: id,
    header,
    cell: ({ row }): ReactElement => (
      <span className="font-mono text-sm tabular-nums">
        {formatDuration(row.original[id] as number)}
      </span>
    ),
  };
}

function createColumns(
  toggleOperation: (op_name: string) => void,
  selectedOperations: readonly string[],
): ColumnDef<OperationStats>[] {
  return [
    {
      id: "op_name",
      accessorKey: "op_name",
      header: "Operation",
      cell: ({ row }): ReactElement => {
        const selected: boolean = selectedOperations.includes(row.original.op_name);
        return (
          <button
            type="button"
            onClick={(): void => toggleOperation(row.original.op_name)}
            aria-pressed={selected}
            title={selected ? "Remove this operation from the filter" : "Filter by this operation"}
            className="bg-muted hover:bg-muted/70 focus-visible:ring-ring rounded px-1.5 py-0.5 text-left font-mono text-sm focus-visible:outline-none focus-visible:ring-2"
          >
            {row.original.op_name}
          </button>
        );
      },
    },
    {
      id: "op_category",
      accessorKey: "op_category",
      header: "Category",
      cell: ({ row }): ReactElement => (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
          <span
            aria-hidden="true"
            className="inline-block size-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: getTraceCategoryColor(row.original.op_category) }}
          />
          {getTraceCategoryLabel(row.original.op_category)}
        </span>
      ),
    },
    {
      id: "count",
      accessorKey: "count",
      header: "Traces",
      cell: ({ row }): ReactElement => (
        <span className="font-mono text-sm tabular-nums">{formatCount(row.original.count)}</span>
      ),
    },
    {
      id: "share",
      accessorKey: "share",
      header: "Share",
      cell: ({ row }): ReactElement => (
        <span className="font-mono text-sm tabular-nums">{formatShare(row.original.share)}</span>
      ),
    },
    durationColumn("mean", "Mean"),
    durationColumn("p50", "p50"),
    durationColumn("p95", "p95"),
    durationColumn("p99", "p99"),
    durationColumn("max", "Max"),
    durationColumn("total", "Total time"),
    {
      id: "last_seen",
      accessorKey: "last_seen",
      header: "Last seen",
      cell: ({ row }): ReactElement => (
        <LocalDateTime value={row.original.last_seen} className="text-sm" />
      ),
    },
  ];
}

const SORTABLE_COLUMNS: string[] = [
  "op_name",
  "op_category",
  "count",
  "share",
  "mean",
  "p50",
  "p95",
  "p99",
  "max",
  "total",
  "last_seen",
];

/** Count and duration percentiles of every operation in the sample. */
export function OperationStatsTile({
  operations,
  refreshing,
  selectedOperations,
  toggleOperation,
}: TraceTileProps): ReactElement {
  const columns = useMemo(
    () => createColumns(toggleOperation, selectedOperations),
    [toggleOperation, selectedOperations],
  );

  return (
    <TraceTileCard
      tile={TRACE_TILES["operation-stats"]}
      description="Sort by any column; click an operation to filter by it."
      refreshing={refreshing}
    >
      <Datatable<OperationStats>
        data={[...operations]}
        columns={columns}
        initialVisibleColumns={{
          op_name: true,
          op_category: true,
          count: true,
          share: true,
          mean: true,
          p50: true,
          p95: true,
          p99: true,
          max: true,
          total: false,
          last_seen: false,
        }}
        datatypeLabel="Operation"
        searchColumn="op_name"
        sortableColumns={SORTABLE_COLUMNS}
        defaultSort={{ id: "count", desc: true }}
        getRowId={(op: OperationStats): string => `${op.op_category}:${op.op_name}`}
      />
    </TraceTileCard>
  );
}

export default OperationStatsTile;
