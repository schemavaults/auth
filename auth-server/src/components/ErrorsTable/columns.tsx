"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import type { ColumnDef } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { MoreHorizontal, Copy, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import { LocalDateTime } from "@schemavaults/auth-ui";
import type { ErrorRow } from "@/lib/auth-db/errors";

export function createColumns(): ColumnDef<ErrorRow>[] {
  return [
    {
      id: "created_at",
      accessorKey: "created_at",
      header: "Time",
      cell: ({ row }): ReactElement => (
        <LocalDateTime
          value={Number(row.original.created_at)}
          className="text-sm"
        />
      ),
    },
    {
      id: "name",
      accessorKey: "name",
      header: "Name",
      cell: ({ row }): ReactElement => (
        <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">
          {row.original.name}
        </code>
      ),
    },
    {
      id: "message",
      accessorKey: "message",
      header: "Message",
      cell: ({ row }): ReactElement => (
        <Link
          href={`/admin/errors/${row.original.error_id}`}
          className="block max-w-xl truncate text-sm hover:underline"
          title={row.original.message}
        >
          {row.original.message}
        </Link>
      ),
    },
    {
      id: "op_name",
      accessorKey: "op_name",
      header: "Operation",
      cell: ({ row }): ReactElement => {
        const op = row.original.op_name;
        const route = row.original.route;
        if (!op && !route) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <div className="flex flex-col gap-0.5">
            {op ? (
              <code className="font-mono text-xs">{op}</code>
            ) : null}
            {route ? (
              <code className="font-mono text-xs text-muted-foreground">
                {route}
              </code>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "uid",
      accessorKey: "uid",
      header: "User",
      cell: ({ row }): ReactElement => {
        const uid = row.original.uid;
        if (!uid) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <code className="font-mono text-xs text-muted-foreground">
            {uid.slice(0, 8)}...
          </code>
        );
      },
    },
    {
      id: "error_id",
      accessorKey: "error_id",
      header: "Error ID",
      cell: ({ row }): ReactElement => (
        <Link
          href={`/admin/errors/${row.original.error_id}`}
          className="font-mono text-xs text-muted-foreground hover:underline"
        >
          {row.original.error_id.slice(0, 8)}...
        </Link>
      ),
    },
    {
      id: "actions",
      cell: function ErrorsTableRowActionsCell({ row }): ReactElement {
        const errorRow = row.original;
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
              <DropdownMenuItem asChild>
                <Link href={`/admin/errors/${errorRow.error_id}`}>
                  <ExternalLink className="h-4 w-4 mr-2" /> View details
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(): void => {
                  navigator.clipboard.writeText(errorRow.error_id);
                }}
              >
                <Copy className="h-4 w-4 mr-2" /> Copy Error ID
              </DropdownMenuItem>
              {errorRow.stack ? (
                <DropdownMenuItem
                  onClick={(): void => {
                    navigator.clipboard.writeText(errorRow.stack ?? "");
                  }}
                >
                  <Copy className="h-4 w-4 mr-2" /> Copy Stack Trace
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
