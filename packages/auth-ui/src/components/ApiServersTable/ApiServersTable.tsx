"use client";

import { useMemo, useState, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { useToast } from "@schemavaults/ui";
import { Datatable } from "@schemavaults/ui";
import { columns } from "./columns";
import type {
  ListApiServersQueryType,
  SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import { SCHEMAVAULTS_ORGANIZATION_ID } from "@schemavaults/auth-common";
import { Loader2 } from "lucide-react";
import {
  clearUseApiServersCache,
  useApiServersList,
} from "./useApiServersList";
import { CreateApiServerDialog } from "@/components/CreateApiServerDialog";
import { ConnectAppToApiDialog } from "@/components/ConnectAppToApiDialog";
import type { PreloadedApiServersTableData } from "./preloaded_api_servers_table_data";

export interface ApiServersDatatableProps {
  queryType: ListApiServersQueryType;
  organization_id?: string;
  preloaded?: PreloadedApiServersTableData | undefined;
}

export function ApiServersTable({
  queryType,
  organization_id,
  preloaded,
}: ApiServersDatatableProps): ReactElement {
  const { toast } = useToast();
  const apis: SWRResponse<readonly SchemaVaultsApiServerDefinition[], Error> =
    useApiServersList({
      toast,
      queryType,
      initialData: preloaded ? preloaded.api_servers : undefined,
      organization_id,
    });
  const { isLoading, data } = apis;
  const [addApiDialogOpen, setAddApiDialogOpen] = useState<boolean>(false);

  // Assert that 'owner_organization_id' field is present from server
  useMemo(() => {
    if (apis.data && Array.isArray(apis.data)) {
      if (
        !apis.data.every(
          (api_server_definition) =>
            api_server_definition.owner_organization_id,
        )
      ) {
        throw new TypeError(
          "Received API server definition that is missing 'owner_organization_id' field!",
        );
      }
    }
  }, [apis.data]);

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <Datatable<SchemaVaultsApiServerDefinition>
      data={[...(data ? (data.length > 0 ? data : []) : [])]}
      columns={columns}
      initialVisibleColumns={{
        actions: true,
        select: true,
        api_server_id: false,
        api_server_name: true,
        api_server_description: true,
        owner_organization_id: false,
      }}
      HeaderButtons={(): ReactElement => {
        return (
          <>
            {(queryType === "all" || queryType === "org") && (
              <CreateApiServerDialog
                clearApiServersCache={clearUseApiServersCache}
                owner_organization_id={
                  queryType === "all"
                    ? SCHEMAVAULTS_ORGANIZATION_ID
                    : organization_id
                }
                open={addApiDialogOpen}
                onOpenChange={setAddApiDialogOpen}
              />
            )}
            {queryType === "all" && <ConnectAppToApiDialog />}
          </>
        );
      }}
      datatypeLabel="Server"
      searchColumn={[
        "api_server_id",
        "api_server_name",
        "api_server_description",
      ]}
    />
  );
}

export default ApiServersTable;
