"use client";

import { useState, type ReactElement } from "react";
import type { ColumnDef } from "@schemavaults/ui";
import {
  Checkbox,
  useToast,
  Button,
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import { MoreHorizontal, X, Loader2 } from "lucide-react";
import type { OrganizationInvitationWithUserData, OrganizationInvitationStatus } from "@schemavaults/auth-common";
import { LocalDateTime } from "@/lib/LocalDateTime";
import { useSWRConfig } from "swr";
import { clearSentInvitationsCache } from "./useSentInvitations";

function getStatusBadgeVariant(
  status: OrganizationInvitationStatus
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "pending":
      return "default";
    case "accepted":
      return "secondary";
    case "declined":
      return "outline";
    case "revoked":
      return "destructive";
    case "expired":
      return "outline";
    default:
      return "outline";
  }
}

function RevokeButton({
  invitation,
}: {
  invitation: OrganizationInvitationWithUserData;
}): ReactElement {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [isLoading, setIsLoading] = useState(false);

  const handleRevoke = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/organizations/${invitation.organization_id}/invitations/${invitation.invitation_id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const body = await response.json();

      if (!response.ok || !body.success) {
        throw new Error(body.message || "Failed to revoke invitation");
      }

      toast({
        title: "Invitation revoked",
        description: `The invitation to ${invitation.invitee_email} has been revoked.`,
      });

      // Refresh the invitations list
      clearSentInvitationsCache(mutate, invitation.organization_id);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Failed to revoke invitation",
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (invitation.status !== "pending") {
    return <></>;
  }

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
          onClick={handleRevoke}
          disabled={isLoading}
          className="text-destructive focus:text-destructive"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <X className="h-4 w-4 mr-2" />
          )}
          Revoke Invitation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const columns: ColumnDef<OrganizationInvitationWithUserData>[] = [
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
    id: "invitee_email",
    accessorKey: "invitee_email",
    header: "Invitee",
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    cell: ({ row }): ReactElement => {
      const invitation: OrganizationInvitationWithUserData = row.original;
      return (
        <Badge variant={getStatusBadgeVariant(invitation.status)}>
          {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
        </Badge>
      );
    },
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Sent At",
    cell: ({ row }): ReactElement => {
      const invitation: OrganizationInvitationWithUserData = row.original;
      return <LocalDateTime value={invitation.created_at} showSeconds={false} />;
    },
  },
  {
    id: "expires_at",
    accessorKey: "expires_at",
    header: "Expires At",
    cell: ({ row }): ReactElement => {
      const invitation: OrganizationInvitationWithUserData = row.original;
      const expires_at = invitation.expires_at;
      const isExpired = Date.now() > expires_at;
      return (
        <div className={isExpired && invitation.status === "pending" ? "text-destructive" : ""}>
          <LocalDateTime value={expires_at} showSeconds={false} />
          {isExpired && invitation.status === "pending" && " (Expired)"}
        </div>
      );
    },
  },
  {
    id: "responded_at",
    accessorKey: "responded_at",
    header: "Responded At",
    cell: ({ row }): ReactElement => {
      const invitation: OrganizationInvitationWithUserData = row.original;
      if (!invitation.responded_at) {
        return <div className="text-muted-foreground">-</div>;
      }
      return <LocalDateTime value={invitation.responded_at} showSeconds={false} />;
    },
  },
  {
    id: "actions",
    cell: function SentInvitationsTableRowActionsCell({
      row,
    }): ReactElement {
      const invitation: OrganizationInvitationWithUserData = row.original;
      return <RevokeButton invitation={invitation} />;
    },
  },
];
