"use client";

import type { ReactElement } from "react";
import type { SWRResponse } from "swr";
import { useToast } from "@schemavaults/ui";
import { Datatable } from "@schemavaults/ui";
import { columns } from "./columns";
import type {
  ListApiServersQueryType,
  SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import { Loader2 } from "lucide-react";
import {
  clearUseApiServersCache,
  useApiServersList,
} from "./useApiServersList";
import { CreateApiServerDialog } from "@/components/CreateApiServerDialog";
import { ConnectAppToApiDialog } from "@/components/ConnectAppToApiDialog";

export interface ApiServersDatatableProps {
  queryType: ListApiServersQueryType;
  organization_id?: string;
}

export function ApiServersTable({
  queryType,
  organization_id,
}: ApiServersDatatableProps): ReactElement {
  const { toast } = useToast();
  const apis: SWRResponse<readonly SchemaVaultsApiServerDefinition[], Error> =
    useApiServersList({ toast, queryType, organization_id });
  const { isLoading, data } = apis;

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
      }}
      HeaderButtons={(): ReactElement => {
        return (
          <>
            {queryType === "all" && (
              <CreateApiServerDialog
                clearApiServersCache={clearUseApiServersCache}
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
