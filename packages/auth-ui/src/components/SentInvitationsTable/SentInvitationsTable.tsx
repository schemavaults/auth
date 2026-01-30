"use client";

import type { ReactElement } from "react";
import { Datatable, useToast } from "@schemavaults/ui";
import { columns } from "./columns";
import { Loader2 } from "lucide-react";
import type { OrganizationInvitationWithUserData, OrganizationID } from "@schemavaults/auth-common";
import { useSentInvitations } from "./useSentInvitations";

export interface SentInvitationsDatatableProps {
  organization_id: OrganizationID;
  preloaded?: readonly OrganizationInvitationWithUserData[] | undefined;
}

export function SentInvitationsTable({
  organization_id,
  preloaded,
}: SentInvitationsDatatableProps): ReactElement {
  const { toast } = useToast();

  const invitations = useSentInvitations({
    organization_id,
    toast,
    initialData: preloaded,
  });
  const { isLoading, data } = invitations;

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="min-h-24 w-full flex items-center justify-center text-muted-foreground">
        No invitations sent
      </div>
    );
  }

  return (
    <Datatable<OrganizationInvitationWithUserData>
      data={data ? (data.length > 0 ? [...data] : []) : []}
      columns={columns}
      initialVisibleColumns={{
        actions: true,
        select: false,
        invitee_email: true,
        status: true,
        created_at: true,
        expires_at: false,
        responded_at: false,
      }}
      datatypeLabel="Invitation"
      searchColumn={["invitee_email"]}
    />
  );
}

export default SentInvitationsTable;
