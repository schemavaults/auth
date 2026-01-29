"use client";

import type { ReactElement } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@schemavaults/ui";
import { MoreHorizontal, Pencil } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import type { ServerSettingRecord } from "@/lib/auth-db/server-settings/types";

export interface ColumnOptions {
  onEditSetting: (setting: ServerSettingRecord) => void;
}

export function createColumns(options: ColumnOptions): ColumnDef<ServerSettingRecord>[] {
  return [
    {
      id: "key",
      accessorKey: "key",
      header: "Key",
      cell: ({ row }): ReactElement => {
        const key = row.original.key;
        return (
          <code className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">
            {key}
          </code>
        );
      },
    },
    {
      id: "value",
      accessorKey: "value",
      header: "Value",
      cell: ({ row }): ReactElement => {
        const value = row.original.value;
        const valueType = row.original.valueType;

        if (valueType === "boolean") {
          return (
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                value
                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
              }`}
            >
              {value ? "true" : "false"}
            </span>
          );
        }

        return (
          <code className="font-mono text-sm">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </code>
        );
      },
    },
    {
      id: "valueType",
      accessorKey: "valueType",
      header: "Type",
      cell: ({ row }): ReactElement => {
        const valueType = row.original.valueType;
        return (
          <span className="inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium">
            {valueType}
          </span>
        );
      },
    },
    {
      id: "description",
      accessorKey: "description",
      header: "Description",
      cell: ({ row }): ReactElement => {
        const description = row.original.description;
        return (
          <span className="text-muted-foreground text-sm">
            {description ?? "-"}
          </span>
        );
      },
    },
    {
      id: "updatedAt",
      accessorKey: "updatedAt",
      header: "Updated At",
      cell: ({ row }): ReactElement => {
        const updatedAt = row.original.updatedAt;
        if (!updatedAt || updatedAt === 0) {
          return <span className="text-muted-foreground text-sm">Default</span>;
        }
        const date = new Date(updatedAt);
        return (
          <span className="text-sm">
            {date.toLocaleDateString()} {date.toLocaleTimeString()}
          </span>
        );
      },
    },
    {
      id: "updatedBy",
      accessorKey: "updatedBy",
      header: "Updated By",
      cell: ({ row }): ReactElement => {
        const updatedBy = row.original.updatedBy;
        return (
          <span className="text-muted-foreground text-sm">
            {updatedBy ?? "-"}
          </span>
        );
      },
    },
    {
      id: "actions",
      cell: function ServerSettingsTableRowActionsCell({ row }): ReactElement {
        const setting = row.original;

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
                onClick={(e): void => {
                  e.preventDefault();
                  options.onEditSetting(setting);
                }}
              >
                <Pencil className="h-4 w-4 mr-2" /> Edit Setting
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
