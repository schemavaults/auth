"use client";

import type { ReactElement } from "react";

import type { ColumnDef } from "@schemavaults/ui";
import { Checkbox, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import {
  ClipboardCopy,
  ExternalLink,
  MoreHorizontal,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import type { UserData } from "@schemavaults/auth-common";
import { LocalDateTime } from "@/lib/LocalDateTime";
import { UserMfaFactorsCell } from "./UserMfaFactorsCell";

export interface BuildUsersTableColumnsOptions {
  getUserHref?: (user: UserData) => string;
}

export function buildColumns(
  opts: BuildUsersTableColumnsOptions = {},
): ColumnDef<UserData>[] {
  const { getUserHref } = opts;

  return [
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
      cell: ({ row }): ReactElement => {
        const user: UserData = row.original;
        if (getUserHref) {
          return (
            <a
              href={getUserHref(user)}
              className="text-primary underline-offset-4 hover:underline"
              data-testid={`users-table-row-link-${user.uid}`}
            >
              {user.email}
            </a>
          );
        }
        return <span>{user.email}</span>;
      },
    },
    {
      id: "uid",
      accessorKey: "uid",
      header: "User ID",
      cell: ({ row }): ReactElement => (
        <span className="font-mono text-xs">{row.original.uid}</span>
      ),
    },
    {
      id: "admin",
      accessorKey: "admin",
      header: "Admin",
      cell: ({ row }): ReactElement => {
        const user: UserData = row.original;
        const isAdmin = user.admin === true;
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
      id: "mfa_factors",
      header: "MFA",
      cell: ({ row }): ReactElement => (
        <UserMfaFactorsCell uid={row.original.uid} />
      ),
      enableSorting: false,
    },
    {
      id: "email_verified",
      accessorKey: "email_verified",
      header: "Email Verified",
      cell: ({ row }): ReactElement => {
        const user: UserData = row.original;
        const isVerified = user.email_verified === true;
        return (
          <span
            className={isVerified ? "text-green-600" : "text-muted-foreground"}
          >
            {isVerified ? "Yes" : "No"}
          </span>
        );
      },
    },
    {
      id: "disabled",
      accessorKey: "disabled",
      header: "Disabled",
      cell: ({ row }): ReactElement => {
        const user: UserData = row.original;
        const isDisabled = user.disabled === true;
        return (
          <span className={isDisabled ? "text-red-600" : "text-muted-foreground"}>
            {isDisabled ? "Yes" : "No"}
          </span>
        );
      },
    },
    {
      id: "invite_code",
      accessorKey: "invite_code",
      header: "Invite Code",
      cell: ({ row }): ReactElement => {
        const user: UserData = row.original;
        return <span>{user.invite_code ?? "-"}</span>;
      },
    },
    {
      id: "created_at",
      accessorKey: "created_at",
      header: "Created At",
      cell: ({ row }): ReactElement => {
        const user: UserData = row.original;
        return <LocalDateTime value={user.created_at} />;
      },
    },
    {
      id: "actions",
      cell: function UsersTableRowActionsCell({ row }): ReactElement {
        const { toast } = useToast();
        const user: UserData = row.original;
        const href: string | undefined = getUserHref
          ? getUserHref(user)
          : undefined;

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
              {href ? (
                <DropdownMenuItem asChild>
                  <a
                    href={href}
                    data-testid={`users-table-row-view-details-${user.uid}`}
                  >
                    <ExternalLink className="h-4 w-4 pr-2" /> View Details
                  </a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={async (e): Promise<void> => {
                  e.preventDefault();
                  const uid: string = user.uid;
                  try {
                    if (!window.isSecureContext) {
                      throw new Error(
                        "Writing to clipboard is only allowed in secure contexts!",
                      );
                    }
                    await navigator.clipboard.writeText(uid);
                  } catch (e: unknown) {
                    toast({
                      title: "Failed to copy user ID to clipboard!",
                      description:
                        e instanceof Error
                          ? e.message
                          : "An unknown error has occurred!",
                    });
                    return;
                  }

                  toast({
                    title: "Successfully copied user ID to clipboard!",
                    description: `You should now be able to paste '${uid}' from your clipboard!`,
                  });
                  return;
                }}
              >
                <ClipboardCopy className="h-4 w-4 pr-2" /> Copy User ID
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async (e): Promise<void> => {
                  e.preventDefault();
                  const email: string = user.email;
                  try {
                    if (!window.isSecureContext) {
                      throw new Error(
                        "Writing to clipboard is only allowed in secure contexts!",
                      );
                    }
                    await navigator.clipboard.writeText(email);
                  } catch (e: unknown) {
                    toast({
                      title: "Failed to copy email to clipboard!",
                      description:
                        e instanceof Error
                          ? e.message
                          : "An unknown error has occurred!",
                    });
                    return;
                  }

                  toast({
                    title: "Successfully copied email to clipboard!",
                    description: `You should now be able to paste '${email}' from your clipboard!`,
                  });
                  return;
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
}

export const columns: ColumnDef<UserData>[] = buildColumns();
