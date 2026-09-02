"use client";

import type { ReactElement } from "react";
import { Datatable } from "@schemavaults/ui";
import { columns, type OrganizationMemberTableData } from "./columns";
import { Loader2 } from "lucide-react";
import { InviteMemberDialogTriggerButton } from "@/components/InviteMemberDialog";
import type { OrganizationID } from "@schemavaults/auth-common";
import { useOrganizationMembers } from "./useOrganizationMembers";

export interface OrganizationMembersDatatableProps {
  organization_id: OrganizationID;
  preloaded_members?: readonly OrganizationMemberTableData[];
  showInviteButton?: boolean;
}

export function OrganizationMembersTable({
  organization_id,
  preloaded_members,
  showInviteButton = true,
}: OrganizationMembersDatatableProps): ReactElement {
  const { data, isLoading } = useOrganizationMembers(organization_id, {
    preloaded: preloaded_members,
  });

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <Datatable<OrganizationMemberTableData>
      data={data ? (data.length > 0 ? [...data] : []) : []}
      columns={columns}
      initialVisibleColumns={{
        actions: true,
        select: true,
        email: true,
        role: true,
        admin: false,
        email_verified: false,
        membership_created_at: true,
        uid: false,
      }}
      HeaderButtons={showInviteButton ? InviteMemberDialogTriggerButton : undefined}
      datatypeLabel="Member"
      searchColumn={["email"]}
    />
  );
}
