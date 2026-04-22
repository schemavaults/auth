"use client";

import { useMemo, type ReactElement } from "react";
import { Datatable } from "@schemavaults/ui";
import type { ErrorRow } from "@/lib/auth-db/errors";
import { createColumns } from "./columns";

export interface ErrorsTableProps {
  data: readonly ErrorRow[];
}

export function ErrorsTable({ data }: ErrorsTableProps): ReactElement {
  const columns = useMemo(() => createColumns(), []);

  return (
    <Datatable<ErrorRow>
      data={[...data]}
      columns={columns}
      HeaderButtons={() => <></>}
      initialVisibleColumns={{
        actions: true,
        created_at: true,
        name: true,
        message: true,
        op_name: true,
        uid: true,
        error_id: false,
      }}
      datatypeLabel="Error"
      searchColumn="message"
    />
  );
}

export default ErrorsTable;
