"use client";

import type { ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { columns, type OrganizationMemberTableData } from "./columns";
import { Loader2 } from "lucide-react";
import InviteMemberDialog from "@/components/InviteMemberDialog";
import type {
  InviteMemberSubmitData,
  OrganizationID,
} from "@schemavaults/auth-common";

export interface OrganizationMembersDatatableProps {
  organization_id: OrganizationID;
  members: SWRResponse<readonly OrganizationMemberTableData[], Error>;
  inviteMember: (
    inviteMemberFormSubmissionData: InviteMemberSubmitData,
  ) => Promise<void>;
}

export function OrganizationMembersTable({
  organization_id,
  members,
  inviteMember,
}: OrganizationMembersDatatableProps): ReactElement {
  const { isLoading, data } = members;

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
      }}
      HeaderButtons={(): ReactElement => {
        return (
          <>
            <InviteMemberDialog
              organization_id={organization_id}
              onSubmit={inviteMember}
            />
          </>
        );
      }}
      datatypeLabel="Member"
      searchColumn={["email"]}
    />
  );
}
