"use client";

import type { ReactElement } from "react";
import { Datatable, useToast } from "@schemavaults/ui";
import { columns } from "./columns";
import { Loader2 } from "lucide-react";
import type { UserPendingInvitation } from "@schemavaults/auth-common";
import { usePendingInvitations } from "./usePendingInvitations";

export interface PendingInvitationsDatatableProps {
  preloaded?: readonly UserPendingInvitation[] | undefined;
}

export function PendingInvitationsTable({
  preloaded,
}: PendingInvitationsDatatableProps): ReactElement {
  const { toast } = useToast();

  const invitations = usePendingInvitations({
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
        No pending invitations
      </div>
    );
  }

  return (
    <Datatable<UserPendingInvitation>
      data={data ? (data.length > 0 ? [...data] : []) : []}
      columns={columns}
      initialVisibleColumns={{
        actions: true,
        select: false,
        organization_name: true,
        inviter_email: true,
        created_at: false,
        expires_at: true,
      }}
      datatypeLabel="Invitation"
      searchColumn={["organization_name", "inviter_email"]}
    />
  );
}

export default PendingInvitationsTable;
