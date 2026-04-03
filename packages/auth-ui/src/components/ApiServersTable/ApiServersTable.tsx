"use client";

import { type FC, useContext, useMemo, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { columns } from "./columns";
import type {
  ListApiServersQueryType,
  SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import { Loader2 } from "lucide-react";
import { useApiServersList } from "./useApiServersList";
import { useAuth } from "@schemavaults/auth-react-provider";
import {
  CreateApiServerDialogOpenDispatchContext,
  CreateApiServerDialogTrigger,
} from "@/components/CreateApiServerDialog";
import {
  ConnectAppToApiDialogOpenDispatchContext,
  ConnectAppToApiDialogTrigger,
} from "@/components/ConnectAppToApiDialog";
import type { PreloadedApiServersTableData } from "./preloaded_api_servers_table_data";
import { ApiServersTableConfigContext } from "./ApiServersTableConfigContext";

export interface ApiServersDatatableProps {
  queryType: ListApiServersQueryType;
  organization_id?: string;
  preloaded?: PreloadedApiServersTableData | undefined;
  showConnectAppToApi?: boolean;
  isOrgOwner?: boolean;
}

function ApiServersTableHeaderButtons({
  queryType,
  showConnectAppToApi,
  isOrgOwner,
}: {
  queryType: ListApiServersQueryType;
  showConnectAppToApi?: boolean;
  isOrgOwner?: boolean;
}) {
  const onOpenChangeCreateApi = useContext(
    CreateApiServerDialogOpenDispatchContext,
  );
  const onOpenChangeConnectAppToApi = useContext(
    ConnectAppToApiDialogOpenDispatchContext,
  );

  return (
    <>
      {(queryType === "all" || (queryType === "org" && isOrgOwner)) && (
        <CreateApiServerDialogTrigger onOpenChange={onOpenChangeCreateApi} />
      )}
      {(queryType === "all" || showConnectAppToApi) && (
        <ConnectAppToApiDialogTrigger
          onOpenChange={onOpenChangeConnectAppToApi}
        />
      )}
    </>
  );
}

export function ApiServersTable({
  queryType,
  organization_id,
  preloaded,
  showConnectAppToApi,
  isOrgOwner,
}: ApiServersDatatableProps): ReactElement {
  const auth = useAuth();
  const authClient = auth.ready ? auth.client.current : undefined;
  const apis: SWRResponse<readonly SchemaVaultsApiServerDefinition[], Error> =
    useApiServersList({
      queryType,
      initialData: preloaded ? preloaded.api_servers : undefined,
      organization_id,
      authClient,
    });
  const { isLoading, data } = apis;

  const HeaderButtons: FC = useMemo(() => {
    return function ApiServersTableHeaderButtonsWithQueryType() {
      return <ApiServersTableHeaderButtons queryType={queryType} showConnectAppToApi={showConnectAppToApi} isOrgOwner={isOrgOwner} />;
    };
  }, [queryType, showConnectAppToApi, isOrgOwner]);

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

  const contextValue = useMemo(
    () => ({ showConnectAppToApi: showConnectAppToApi ?? false, isOrgOwner: isOrgOwner ?? false }),
    [showConnectAppToApi, isOrgOwner],
  );

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <ApiServersTableConfigContext.Provider value={contextValue}>
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
        HeaderButtons={HeaderButtons}
        datatypeLabel="Server"
        searchColumn={[
          "api_server_id",
          "api_server_name",
          "api_server_description",
        ]}
      />
    </ApiServersTableConfigContext.Provider>
  );
}

export default ApiServersTable;
