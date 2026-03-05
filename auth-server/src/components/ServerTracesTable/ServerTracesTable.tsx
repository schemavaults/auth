"use client";

import { useMemo, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { Loader2 } from "lucide-react";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";
import { createColumns } from "./columns";

export interface ServerTracesTableProps {
  traces: SWRResponse<readonly ServerTraceRow[], Error>;
}

export function ServerTracesTable({
  traces,
}: ServerTracesTableProps): ReactElement {
  const { isLoading, data } = traces;

  const columns = useMemo(() => createColumns(), []);

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <Datatable<ServerTraceRow>
      data={data ? [...data] : []}
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
    />
  );
}

export default ServerTracesTable;
