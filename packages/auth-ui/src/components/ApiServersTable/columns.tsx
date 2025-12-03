"use client";

import type { ReactElement } from "react"

import type { ColumnDef } from "@tanstack/react-table"
import { Checkbox } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { MoreHorizontal } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@schemavaults/ui";
import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";

export const columns: ColumnDef<SchemaVaultsApiServerDefinition>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: 'id',
    accessorKey: "api_server_id",
    header: "API Server ID"
  },
  {
    id: 'name',
    accessorKey: "api_server_name",
    header: "API Server Name"
  },
  {
    id: 'description',
    accessorKey: "api_server_description",
    header: "Description"
  },
  {
    id: "actions",
    cell: ({ row }): ReactElement => {
      const api = row.original

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
              onClick={() => navigator.clipboard.writeText(api.api_server_id)}
            >
              Copy API Server ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {/* <DropdownMenuItem>Authorize app</DropdownMenuItem> */}
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  }
]
