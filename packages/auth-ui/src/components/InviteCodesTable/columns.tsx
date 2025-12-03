"use client";

import type { ReactElement } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { ClipboardCopy, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import type { InviteCodeDefinition } from "@schemavaults/auth-common";
import printDateTime from "@/lib/printDateTime";

export const columns: ColumnDef<InviteCodeDefinition>[] = [
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
    id: "invite_code",
    accessorKey: "invite_code",
    header: "Invite Code",
  },
  {
    id: "description",
    accessorKey: "description",
    header: "Description",
  },
  {
    id: "max_uses",
    accessorKey: "max_uses",
    header: "Max Uses",
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Creation Time",
    cell: ({ row }): ReactElement => {
      const invite_code_definition: InviteCodeDefinition = row.original;
      const created_at = invite_code_definition.created_at;
      const asDate = new Date(created_at);
      return <div>{printDateTime(asDate)}</div>;
    },
  },
  {
    id: "actions",
    cell: function InviteCodesTableRowActionsCell({ row }): ReactElement {
      const { toast } = useToast();
      const invite_code_definition: InviteCodeDefinition = row.original;

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
                const invite_code: string = invite_code_definition.invite_code;
                navigator.clipboard
                  .writeText(invite_code)
                  .then((): void => {
                    toast({
                      title: "Successfully copied invite code to clipboard!",
                      description: `You should now be able to paste '${invite_code}' from your clipboard!`,
                    });
                  })
                  .catch((e: unknown): void => {
                    toast({
                      title: "Failed to copy invite code to clipboard!",
                      description:
                        e instanceof Error
                          ? e.message
                          : "An unknown error has occurred!",
                    });
                  });
              }}
            >
              <ClipboardCopy className="h-4 w-4 pr-2" /> Copy Invite Code
            </DropdownMenuItem>
            {/* <DropdownMenuSeparator /> */}
            {/* <DropdownMenuItem>Authorize app</DropdownMenuItem> */}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
