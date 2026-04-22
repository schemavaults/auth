"use client";

import { useState, type ReactElement } from "react";

import type { ColumnDef } from "@schemavaults/ui";
import { Checkbox, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import {
  ClipboardCopy,
  MoreHorizontal,
  ShieldCheck,
  ShieldX,
  Crown,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import { LocalDateTime } from "@/lib/LocalDateTime";
import { useSWRConfig } from "swr";

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
      return <span className="capitalize">{member.role}</span>;
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
        <span
          className={isVerified ? "text-green-600" : "text-muted-foreground"}
        >
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
      return <LocalDateTime value={member.membership_created_at} />;
    },
  },
  {
    id: "actions",
    cell: function OrganizationMembersTableRowActionsCell({
      row,
    }): ReactElement {
      const { toast } = useToast();
      const { mutate } = useSWRConfig();
      const member = row.original;
      const [isChangingRole, setIsChangingRole] = useState(false);

      const canChangeRole = member.role !== "admin"; // Cannot change virtual admin roles
      const isOwner = member.role === "owner";
      const isMember = member.role === "member";

      const handleRoleChange = async (newRole: "owner" | "member") => {
        setIsChangingRole(true);
        try {
          const response = await fetch(
            `/api/organizations/${member.organization_id}/members/${member.uid}/role`,
            {
              method: "PATCH",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ role: newRole }),
            },
          );

          const body = await response.json();

          if (!response.ok || !body.success) {
            throw new Error(
              body.message ||
                `Failed to ${newRole === "owner" ? "promote" : "demote"} member`,
            );
          }

          toast({
            title:
              newRole === "owner"
                ? "Member promoted to owner"
                : "Owner demoted to member",
            description: `${member.email} is now ${newRole === "owner" ? "an owner" : "a member"} of this organization.`,
          });

          // Refresh the members list
          mutate(`/api/organizations/${member.organization_id}/members`);
        } catch (error: unknown) {
          toast({
            variant: "destructive",
            title: `Failed to ${newRole === "owner" ? "promote" : "demote"} member`,
            description:
              error instanceof Error
                ? error.message
                : "An unknown error occurred",
          });
        } finally {
          setIsChangingRole(false);
        }
      };

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0"
              data-testid="member-actions-button"
            >
              <span className="sr-only">Open menu</span>
              {isChangingRole ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MoreHorizontal className="h-4 w-4" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={async (e): Promise<void> => {
                e.preventDefault();
                const uid: string = member.uid;
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
              <ClipboardCopy className="h-4 w-4 mr-2" /> Copy User ID
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
              <ClipboardCopy className="h-4 w-4 mr-2" /> Copy Email
            </DropdownMenuItem>
            {canChangeRole && (
              <>
                <DropdownMenuSeparator />
                {isMember && (
                  <DropdownMenuItem
                    onClick={(e): void => {
                      e.preventDefault();
                      handleRoleChange("owner");
                    }}
                    disabled={isChangingRole}
                    data-testid="promote-to-owner-menu-item"
                  >
                    {isChangingRole ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Crown className="h-4 w-4 mr-2" />
                    )}
                    Promote to Owner
                  </DropdownMenuItem>
                )}
                {isOwner && (
                  <DropdownMenuItem
                    onClick={(e): void => {
                      e.preventDefault();
                      handleRoleChange("member");
                    }}
                    disabled={isChangingRole}
                    data-testid="demote-to-member-menu-item"
                  >
                    {isChangingRole ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ShieldX className="h-4 w-4 mr-2" />
                    )}
                    Demote to Member
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
