"use client";

import type { ReactElement } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { ClipboardCopy, Eye, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import printDateTime from "@/lib/printDateTime";

export const columns: ColumnDef<OrganizationDefinition>[] = [
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
    id: "organization_id",
    accessorKey: "organization_id",
    header: "Organization ID",
  },
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Created At",
    cell: ({ row }): ReactElement => {
      const org: OrganizationDefinition = row.original;
      const created_at = org.created_at;
      const asDate = new Date(created_at);
      return <div>{printDateTime(asDate)}</div>;
    },
  },
  {
    id: "actions",
    cell: function OrganizationsTableRowActionsCell({ row }): ReactElement {
      const { toast } = useToast();
      const org: OrganizationDefinition = row.original;

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
              <Link href={`/org/${org.organization_id}`}>
                <Eye className="h-4 w-4 pr-2" /> View Organization
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e): void => {
                e.preventDefault();
                const organization_id: string = org.organization_id;
                navigator.clipboard
                  .writeText(organization_id)
                  .then((): void => {
                    toast({
                      title: "Successfully copied organization ID to clipboard!",
                      description: `You should now be able to paste '${organization_id}' from your clipboard!`,
                    });
                  })
                  .catch((e: unknown): void => {
                    toast({
                      title: "Failed to copy organization ID to clipboard!",
                      description:
                        e instanceof Error
                          ? e.message
                          : "An unknown error has occurred!",
                    });
                  });
              }}
            >
              <ClipboardCopy className="h-4 w-4 pr-2" /> Copy Organization ID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
