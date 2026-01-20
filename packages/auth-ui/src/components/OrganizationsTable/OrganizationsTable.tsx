"use client";

import type { ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { columns } from "./columns";
import { Loader2 } from "lucide-react";
import type { OrganizationDefinition } from "@schemavaults/auth-common";

export interface OrganizationsDatatableProps {
  organizations: SWRResponse<readonly OrganizationDefinition[], Error>;
}

export function OrganizationsTable({
  organizations,
}: OrganizationsDatatableProps): ReactElement {
  const { isLoading, data } = organizations;

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <Datatable<OrganizationDefinition>
      data={data ? (data.length > 0 ? [...data] : []) : []}
      columns={columns}
      initialVisibleColumns={{
        actions: true,
        select: true,
        organization_id: true,
        name: true,
        created_at: true,
      }}
      HeaderButtons={(): ReactElement => {
        return <></>;
      }}
      datatypeLabel="Organization"
      searchColumn={["organization_id", "name"]}
    />
  );
}
