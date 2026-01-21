"use client";

import type { ReactElement } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox, cn, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { ClipboardCopy, Key, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import type {
  ApiServerId,
  SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import Link from "next/link";
import type { OrganizationID } from "@schemavaults/auth-common";

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
    cell: function ApiServerRowActionsCell({ row }): ReactElement {
      const api = row.original;
      const api_server_id: ApiServerId = api.api_server_id;
      const { toast } = useToast();

      const menuItemClassname: string = cn(
        "flex flex-row flex-nowrap gap-2 items-center justify-start",
      );
      const menuItemIconClassname: string = cn("h-4 w-4");

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
              onClick={async (e) => {
                e.preventDefault();
                try {
                  await navigator.clipboard.writeText(api_server_id);
                } catch (e: unknown) {
                  toast({
                    variant: "destructive",
                    title: "Failed to copy API server ID to clipboard",
                    description:
                      e instanceof Error
                        ? e.message
                        : "An unknown error has occurred!",
                  });
                  return;
                }

                toast({
                  title: "Successfully copied API server ID to clipboard",
                  description: `You can now paste: '${api_server_id}'`,
                });
                return;
              }}
              className={menuItemClassname}
            >
              <ClipboardCopy className={menuItemIconClassname} /> Copy API
              Server ID
            </DropdownMenuItem>
            <Link
              href={`/apis/${api_server_id}/jwks-keys`}
              className="hover:cursor-pointer"
            >
              <DropdownMenuItem className={menuItemClassname}>
                <Key className={menuItemIconClassname} /> Manage Access Keys
              </DropdownMenuItem>
            </Link>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
