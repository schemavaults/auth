"use client";

import { useState, type ReactElement } from "react";
import type { ColumnDef } from "@schemavaults/ui";
import { Checkbox, useToast, Button } from "@schemavaults/ui";
import { Check, X, Loader2 } from "lucide-react";
import type { UserPendingInvitation } from "@schemavaults/auth-common";
import { LocalDateTime } from "@/lib/LocalDateTime";
import { useSWRConfig } from "swr";
import { clearPendingInvitationsCache } from "./usePendingInvitations";

function AcceptDeclineButtons({
  invitation,
}: {
  invitation: UserPendingInvitation;
}): ReactElement {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [isLoading, setIsLoading] = useState<"accept" | "decline" | null>(null);

  const handleResponse = async (action: "accept" | "decline") => {
    setIsLoading(action);
    try {
      const response = await fetch(
        `/api/organizations/${invitation.organization_id}/invitations/${invitation.invitation_id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        }
      );

      const body = await response.json();

      if (!response.ok || !body.success) {
        throw new Error(body.message || `Failed to ${action} invitation`);
      }

      toast({
        title: action === "accept" ? "Joined organization!" : "Invitation declined",
        description:
          action === "accept"
            ? `You are now a member of ${invitation.organization_name}`
            : `You declined the invitation to ${invitation.organization_name}`,
      });

      // Refresh the invitations list
      clearPendingInvitationsCache(mutate);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: `Failed to ${action} invitation`,
        description:
          error instanceof Error ? error.message : "An unknown error occurred",
      });
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="flex gap-2">
      <Button
        variant="default"
        size="sm"
        onClick={() => handleResponse("accept")}
        disabled={isLoading !== null}
      >
        {isLoading === "accept" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Check className="h-4 w-4" />
        )}
        <span className="ml-1">Accept</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleResponse("decline")}
        disabled={isLoading !== null}
      >
        {isLoading === "decline" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <X className="h-4 w-4" />
        )}
        <span className="ml-1">Decline</span>
      </Button>
    </div>
  );
}

export const columns: ColumnDef<UserPendingInvitation>[] = [
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
    id: "organization_name",
    accessorKey: "organization_name",
    header: "Organization",
  },
  {
    id: "inviter_email",
    accessorKey: "inviter_email",
    header: "Invited By",
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Invited At",
    cell: ({ row }): ReactElement => {
      const invitation: UserPendingInvitation = row.original;
      return <LocalDateTime value={invitation.created_at} showSeconds={false} />;
    },
  },
  {
    id: "expires_at",
    accessorKey: "expires_at",
    header: "Expires At",
    cell: ({ row }): ReactElement => {
      const invitation: UserPendingInvitation = row.original;
      return <LocalDateTime value={invitation.expires_at} showSeconds={false} />;
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: function PendingInvitationsTableRowActionsCell({
      row,
    }): ReactElement {
      const invitation: UserPendingInvitation = row.original;
      return <AcceptDeclineButtons invitation={invitation} />;
    },
  },
];
