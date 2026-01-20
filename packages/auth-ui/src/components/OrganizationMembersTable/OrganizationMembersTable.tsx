"use client";

import type { ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { columns, type OrganizationMemberTableData } from "./columns";
import { Loader2 } from "lucide-react";

export interface OrganizationMembersDatatableProps {
  members: SWRResponse<readonly OrganizationMemberTableData[], Error>;
}

export function OrganizationMembersTable({ members }: OrganizationMembersDatatableProps): ReactElement {
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
        return <></>;
      }}
      datatypeLabel="Member"
      searchColumn={['email']}
    />
  );
}
