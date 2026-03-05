"use client";

import type { ReactElement } from "react";
import type { ColumnDef } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { MoreHorizontal, Copy } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";

export function createColumns(): ColumnDef<ServerTraceRow>[] {
  return [
    {
      id: "op_name",
      accessorKey: "op_name",
      header: "Operation",
      cell: ({ row }): ReactElement => {
        return (
          <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">
            {row.original.op_name}
          </code>
        );
      },
    },
    {
      id: "op_category",
      accessorKey: "op_category",
      header: "Category",
      cell: ({ row }): ReactElement => {
        return (
          <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium">
            {row.original.op_category}
          </span>
        );
      },
    },
    {
      id: "event_id",
      accessorKey: "event_id",
      header: "Event ID",
      cell: ({ row }): ReactElement => {
        return (
          <code className="font-mono text-xs text-muted-foreground">
            {row.original.event_id.slice(0, 8)}...
          </code>
        );
      },
    },
    {
      id: "start_time",
      accessorKey: "start_time",
      header: "Start Time",
      cell: ({ row }): ReactElement => {
        const date = new Date(row.original.start_time);
        return (
          <span className="text-sm">
            {date.toLocaleDateString()} {date.toLocaleTimeString()}
          </span>
        );
      },
    },
    {
      id: "end_time",
      accessorKey: "end_time",
      header: "End Time",
      cell: ({ row }): ReactElement => {
        const date = new Date(row.original.end_time);
        return (
          <span className="text-sm">
            {date.toLocaleDateString()} {date.toLocaleTimeString()}
          </span>
        );
      },
    },
    {
      id: "duration",
      header: "Duration (ms)",
      cell: ({ row }): ReactElement => {
        const duration = row.original.end_time - row.original.start_time;
        return (
          <span className="font-mono text-sm">
            {duration}
          </span>
        );
      },
    },
    {
      id: "actions",
      cell: function ServerTracesTableRowActionsCell({ row }): ReactElement {
        const trace = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={(): void => {
                  navigator.clipboard.writeText(trace.event_id);
                }}
              >
                <Copy className="h-4 w-4 mr-2" /> Copy Event ID
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
