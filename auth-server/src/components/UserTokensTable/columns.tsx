"use client";

import type { ReactElement } from "react";
import type { ColumnDef } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { Copy, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import { LocalDateTime } from "@schemavaults/auth-ui";
import type { IssuedTokenRow } from "@/lib/auth-db/issued-tokens";

export function createColumns(): ColumnDef<IssuedTokenRow>[] {
  return [
    {
      id: "jti",
      accessorKey: "jti",
      header: "JTI",
      cell: ({ row }): ReactElement => (
        <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all">
          {row.original.jti}
        </code>
      ),
    },
    {
      id: "expires_at",
      accessorKey: "expires_at",
      header: "Expires At",
      cell: ({ row }): ReactElement => (
        <LocalDateTime
          value={Number(row.original.expires_at)}
          className="text-sm"
        />
      ),
    },
    {
      id: "actions",
      cell: function UserTokensTableRowActionsCell({ row }): ReactElement {
        const token = row.original;
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
                  navigator.clipboard.writeText(token.jti);
                }}
              >
                <Copy className="h-4 w-4 mr-2" /> Copy JTI
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
