"use client";

import { useState, type ReactElement } from "react";
import { Button, useToast } from "@schemavaults/ui";
import { Check, Loader2, X } from "lucide-react";
import { clearPendingInvitationsCache } from "./usePendingInvitations";
import { useSWRConfig } from "swr";
import type {
  OrganizationID,
  UserPendingInvitation,
} from "@schemavaults/auth-common";

export default function AcceptDeclineOrgInvitationButtons({
  invitation,
}: {
  invitation: UserPendingInvitation;
}): ReactElement {
  const organization_id: OrganizationID = invitation.organization_id;
  const invitation_id: string = invitation.invitation_id;

  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const [isLoading, setIsLoading] = useState<"accept" | "decline" | null>(null);

  const handleResponse = async (action: "accept" | "decline") => {
    setIsLoading(action);
    try {
      const response = await fetch(
        `/api/organizations/${organization_id}/invitations/${invitation_id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action }),
        },
      );

      const body = await response.json();

      if (!response.ok || !body.success) {
        throw new Error(body.message || `Failed to ${action} invitation`);
      }

      toast({
        title:
          action === "accept" ? "Joined organization!" : "Invitation declined",
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
        id={`accept-invitation-[${invitation_id}]-for-org-[${organization_id}]`}
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
        id={`decline-invitation-[${invitation_id}]-for-org-[${organization_id}]`}
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
