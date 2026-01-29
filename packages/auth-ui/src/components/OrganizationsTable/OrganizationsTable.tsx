"use client";

import { useContext, type ReactElement } from "react";
import { Datatable } from "@schemavaults/ui";
import { columns } from "./columns";
import { Loader2 } from "lucide-react";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import { CreateOrganizationDialogTrigger } from "@/components/CreateOrganizationDialog";
import { CreateOrganizationDialogDispatchContext } from "@/components/CreateOrganizationDialog";
import useAllOrganizationsList from "./useAllOrganizationsList";

export interface OrganizationsDatatableProps {
  preloaded_organizations: readonly OrganizationDefinition[] | undefined;
}

function OrganizationsTableHeaderButtons(): ReactElement {
  const onOpenChange: (val: boolean) => void = useContext(
    CreateOrganizationDialogDispatchContext,
  );
  return <CreateOrganizationDialogTrigger onOpenChange={onOpenChange} />;
}

export function OrganizationsTable({
  preloaded_organizations,
}: OrganizationsDatatableProps): ReactElement {
  const { isLoading, data } = useAllOrganizationsList({
    initialData: preloaded_organizations,
  });

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
      HeaderButtons={OrganizationsTableHeaderButtons}
      datatypeLabel="Organization"
      searchColumn={["organization_id", "name"]}
    />
  );
}
