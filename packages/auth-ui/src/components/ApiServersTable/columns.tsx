"use client";

import type { ReactElement } from "react";

import type { ColumnDef } from "@schemavaults/ui";
import { Checkbox } from "@schemavaults/ui";
import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";
import { ApiServerRowActions } from "./ApiServerRowActions";

export const columns: ColumnDef<SchemaVaultsApiServerDefinition>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
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
    id: "api_server_id",
    accessorKey: "api_server_id",
    header: "API Server ID",
  },
  {
    id: "api_server_name",
    accessorKey: "api_server_name",
    header: "API Server Name",
  },
  {
    id: "api_server_description",
    accessorKey: "api_server_description",
    header: "Description",
  },
  {
    id: "owner_organization_id",
    accessorKey: "owner_organization_id",
    header: "Owner Organization",
  },
  {
    id: "actions",
    cell: ({ row }): ReactElement => {
      const api = row.original;
      return <ApiServerRowActions api={api} />;
    },
  },
];
