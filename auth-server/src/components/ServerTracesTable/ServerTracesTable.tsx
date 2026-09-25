"use client";

import { useMemo, type ReactElement } from "react";
import { Datatable } from "@schemavaults/ui";
import { Loader2 } from "lucide-react";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";
import { createColumns } from "./columns";

export interface ServerTracesTableProps {
  traces: readonly ServerTraceRow[];
  /** Shows a spinner instead of an empty table until the first listing arrives. */
  loading?: boolean;
  /** Adds a "Filter by this operation" row action. */
  onFilterByOperation?: (op_name: string) => void;
}

export function ServerTracesTable({
  traces,
  loading = false,
  onFilterByOperation,
}: ServerTracesTableProps): ReactElement {
  const columns = useMemo(
    () => createColumns({ onFilterByOperation }),
    [onFilterByOperation],
  );

  if (loading && traces.length === 0) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <Datatable<ServerTraceRow>
      data={[...traces]}
      columns={columns}
      HeaderButtons={() => <></>}
      initialVisibleColumns={{
        actions: true,
        op_name: true,
        op_category: true,
        event_id: false,
        start_time: true,
        end_time: false,
        duration: true,
      }}
      datatypeLabel="Trace"
      searchColumn="op_name"
      sortableColumns={["op_name", "op_category", "start_time", "end_time", "duration"]}
      defaultSort={{ id: "start_time", desc: true }}
      getRowId={(trace: ServerTraceRow): string => trace.event_id}
    />
  );
}

export default ServerTracesTable;
