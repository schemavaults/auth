"use client";

import { useState, type ReactElement } from "react";
import type { SWRResponse, useSWRConfig } from "swr";
import { Datatable } from "@schemavaults/ui";
import { columns } from "./columns";
import { Loader2 } from "lucide-react";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import CreateOrganizationDialog from "@/components/CreateOrganizationDialog";

export interface OrganizationsDatatableProps {
  organizations: SWRResponse<readonly OrganizationDefinition[], Error>;
}

function clearOrganizationsCache(
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
): void {
  mutate("/api/organizations");
}

export function OrganizationsTable({
  organizations,
}: OrganizationsDatatableProps): ReactElement {
  const { isLoading, data } = organizations;
  const [createDialogOpen, setCreateDialogOpen] = useState<boolean>(false);

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
        return (
          <CreateOrganizationDialog
            clearOrganizationsCache={clearOrganizationsCache}
            open={createDialogOpen}
            onOpenChange={setCreateDialogOpen}
          />
        );
      }}
      datatypeLabel="Organization"
      searchColumn={["organization_id", "name"]}
    />
  );
}
