"use client";

import { type FC, useContext, useMemo, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { getApiServersTableColumns } from "./columns";
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
import type { PreloadedApiServersTableDataWithDomainRefs } from "./preloaded_api_servers_table_data";
import { ApiServersTableConfigContext } from "./ApiServersTableConfigContext";
import type { ColumnDef } from "@schemavaults/ui";
import {
  useOwnerTypeFilteredResources,
  type OwnerTypeFilterValue,
} from "@/components/OwnerTypeFilter";

export interface ApiServersDatatableProps {
  queryType: ListApiServersQueryType;
  organization_id?: string;
  preloaded?: PreloadedApiServersTableDataWithDomainRefs | undefined;
  showConnectAppToApi?: boolean;
  isOrgOwner?: boolean;
  /**
   * For the "accessible" query: ids of the organizations in which the
   * viewer is an owner/admin, used to decide which rows expose management
   * actions.
   */
  managedOrganizationIds?: readonly string[];
  /** Client-side filter on each row's resolved owner type. */
  ownerTypeFilter?: OwnerTypeFilterValue;
  /** Whether the "Create API" button is offered (default true). */
  canCreate?: boolean;
}

function ApiServersTableHeaderButtons({
  queryType,
  showConnectAppToApi,
  isOrgOwner,
  canCreate,
}: {
  queryType: ListApiServersQueryType;
  showConnectAppToApi?: boolean;
  isOrgOwner?: boolean;
  canCreate: boolean;
}) {
  const onOpenChangeCreateApi = useContext(
    CreateApiServerDialogOpenDispatchContext,
  );
  const onOpenChangeConnectAppToApi = useContext(
    ConnectAppToApiDialogOpenDispatchContext,
  );

  return (
    <>
      {canCreate &&
        (queryType === "all" ||
          queryType === "owned" ||
          queryType === "accessible" ||
          (queryType === "org" && isOrgOwner)) && (
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
  managedOrganizationIds,
  ownerTypeFilter,
  canCreate = true,
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
  const { isLoading } = apis;
  const data = useOwnerTypeFilteredResources(apis.data, ownerTypeFilter);

  const columns = useMemo((): ColumnDef<SchemaVaultsApiServerDefinition>[] => {
    return getApiServersTableColumns(preloaded);
  }, [preloaded]);

  const HeaderButtons: FC = useMemo(() => {
    return function ApiServersTableHeaderButtonsWithQueryType() {
      return (
        <ApiServersTableHeaderButtons
          queryType={queryType}
          showConnectAppToApi={showConnectAppToApi}
          isOrgOwner={isOrgOwner}
          canCreate={canCreate}
        />
      );
    };
  }, [queryType, showConnectAppToApi, isOrgOwner, canCreate]);

  const contextValue = useMemo(
    () => ({
      showConnectAppToApi: showConnectAppToApi ?? false,
      isOrgOwner: isOrgOwner ?? false,
      queryType,
      managedOrganizationIds,
    }),
    [showConnectAppToApi, isOrgOwner, queryType, managedOrganizationIds],
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
          domains: true,
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
