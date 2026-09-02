"use client";

import type { ReactElement } from "react";
import type { ColumnDef } from "@schemavaults/ui";
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  useToast,
} from "@schemavaults/ui";
import { ClipboardCopy, Eye, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import type { OrganizationMembershipRoleDetails } from "@schemavaults/auth-common";
import { LocalDateTime } from "@/lib/LocalDateTime";

function roleBadgeVariant(
  role: OrganizationMembershipRoleDetails["role"],
): "default" | "secondary" | "outline" {
  switch (role) {
    case "owner":
      return "default";
    case "admin":
      return "secondary";
    default:
      return "outline";
  }
}

export const columns: ColumnDef<OrganizationMembershipRoleDetails>[] = [
  {
    id: "organization_name",
    accessorKey: "organization_name",
    header: "Organization",
    cell: ({ row }): ReactElement => {
      const membership: OrganizationMembershipRoleDetails = row.original;
      return (
        <Link
          href={`/orgs/${membership.organization_id}`}
          className="hover:underline text-primary"
          data-testid={`my-org-link-${membership.organization_id}`}
        >
          {membership.organization_name}
        </Link>
      );
    },
  },
  {
    id: "organization_id",
    accessorKey: "organization_id",
    header: "Organization ID",
    cell: ({ row }): ReactElement => {
      const membership: OrganizationMembershipRoleDetails = row.original;
      return (
        <Link
          href={`/orgs/${membership.organization_id}`}
          className="hover:underline text-primary"
        >
          {membership.organization_id}
        </Link>
      );
    },
  },
  {
    id: "role",
    accessorKey: "role",
    header: "Your Role",
    cell: ({ row }): ReactElement => {
      const membership: OrganizationMembershipRoleDetails = row.original;
      return (
        <Badge variant={roleBadgeVariant(membership.role)} className="capitalize">
          {membership.role}
        </Badge>
      );
    },
  },
  {
    id: "joined_at",
    accessorKey: "joined_at",
    header: "Member Since",
    cell: ({ row }): ReactElement => {
      const membership: OrganizationMembershipRoleDetails = row.original;
      return <LocalDateTime value={membership.joined_at} showSeconds={false} />;
    },
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Created At",
    cell: ({ row }): ReactElement => {
      const membership: OrganizationMembershipRoleDetails = row.original;
      return (
        <LocalDateTime value={membership.created_at} showSeconds={false} />
      );
    },
  },
  {
    id: "actions",
    cell: function MyOrganizationsTableRowActionsCell({ row }): ReactElement {
      const { toast } = useToast();
      const membership: OrganizationMembershipRoleDetails = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 w-8 p-0"
              data-testid={`my-org-actions-button-${membership.organization_id}`}
            >
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href={`/orgs/${membership.organization_id}`}>
                <Eye className="h-4 w-4 pr-2" /> View Organization
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async (e): Promise<void> => {
                e.preventDefault();
                const organization_id: string = membership.organization_id;
                try {
                  if (!window.isSecureContext) {
                    throw new Error(
                      "Writing to clipboard is only allowed in secure contexts!",
                    );
                  }
                  await navigator.clipboard.writeText(organization_id);
                } catch (e: unknown) {
                  toast({
                    title: "Failed to copy organization ID to clipboard!",
                    description:
                      e instanceof Error
                        ? e.message
                        : "An unknown error has occurred!",
                  });
                  return;
                }

                toast({
                  title: "Successfully copied organization ID to clipboard!",
                  description: `You should now be able to paste '${organization_id}' from your clipboard!`,
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
