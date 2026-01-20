"use client";

import type { ReactElement } from "react";

import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { ClipboardCopy, MoreHorizontal, ShieldCheck, ShieldX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import printDateTime from "@/lib/printDateTime";

export type OrganizationMemberTableData = {
  membership_declaration_id: string;
  organization_id: string;
  uid: string;
  role: string;
  membership_created_at: number;
  email: string;
  email_verified?: boolean;
  admin?: boolean;
  disabled?: boolean;
};

export const columns: ColumnDef<OrganizationMemberTableData>[] = [
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
    id: "email",
    accessorKey: "email",
    header: "Email",
  },
  {
    id: "role",
    accessorKey: "role",
    header: "Role",
    cell: ({ row }): ReactElement => {
      const member = row.original;
      return (
        <span className="capitalize">{member.role}</span>
      );
    },
  },
  {
    id: "admin",
    accessorKey: "admin",
    header: "Admin",
    cell: ({ row }): ReactElement => {
      const member = row.original;
      const isAdmin = member.admin === true;
      return (
        <div className="flex items-center gap-1">
          {isAdmin ? (
            <>
              <ShieldCheck className="h-4 w-4 text-green-600" />
              <span className="text-green-600">Yes</span>
            </>
          ) : (
            <>
              <ShieldX className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">No</span>
            </>
          )}
        </div>
      );
    },
  },
  {
    id: "email_verified",
    accessorKey: "email_verified",
    header: "Email Verified",
    cell: ({ row }): ReactElement => {
      const member = row.original;
      const isVerified = member.email_verified === true;
      return (
        <span className={isVerified ? "text-green-600" : "text-muted-foreground"}>
          {isVerified ? "Yes" : "No"}
        </span>
      );
    },
  },
  {
    id: "membership_created_at",
    accessorKey: "membership_created_at",
    header: "Joined At",
    cell: ({ row }): ReactElement => {
      const member = row.original;
      const created_at = member.membership_created_at;
      const asDate = new Date(created_at);
      return <div>{printDateTime(asDate)}</div>;
    },
  },
  {
    id: "actions",
    cell: function OrganizationMembersTableRowActionsCell({ row }): ReactElement {
      const { toast } = useToast();
      const member = row.original;

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
                const uid: string = member.uid;
                navigator.clipboard
                  .writeText(uid)
                  .then((): void => {
                    toast({
                      title: "Successfully copied user ID to clipboard!",
                      description: `You should now be able to paste '${uid}' from your clipboard!`,
                    });
                  })
                  .catch((e: unknown): void => {
                    toast({
                      title: "Failed to copy user ID to clipboard!",
                      description:
                        e instanceof Error
                          ? e.message
                          : "An unknown error has occurred!",
                    });
                  });
              }}
            >
              <ClipboardCopy className="h-4 w-4 pr-2" /> Copy User ID
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e): void => {
                e.preventDefault();
                const email: string = member.email;
                navigator.clipboard
                  .writeText(email)
                  .then((): void => {
                    toast({
                      title: "Successfully copied email to clipboard!",
                      description: `You should now be able to paste '${email}' from your clipboard!`,
                    });
                  })
                  .catch((e: unknown): void => {
                    toast({
                      title: "Failed to copy email to clipboard!",
                      description:
                        e instanceof Error
                          ? e.message
                          : "An unknown error has occurred!",
                    });
                  });
              }}
            >
              <ClipboardCopy className="h-4 w-4 pr-2" /> Copy Email
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
