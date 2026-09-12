"use client";

import { useMemo, type FC, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { getAppsTableColumns } from "./columns";
import { useAppsList } from "./useAppsList";
import type {
  ListAppsQueryType,
  SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import { CreateAppDialogTrigger } from "@/components/CreateAppDialog";
import { AuthorizeClientApplicationDialogTrigger } from "@/components/AuthorizeClientApplicationDialog";
import { Loader2 } from "lucide-react";
import { useAuth } from "@schemavaults/auth-react-provider";
import type { ColumnDef } from "@schemavaults/ui";
import type { PreloadedAppsTableDataWithDomainRefs } from "./preloaded_apps_table_data";
import {
  useOwnerTypeFilteredResources,
  type OwnerTypeFilterValue,
} from "@/components/OwnerTypeFilter";

export interface AppsDatatableProps {
  queryType: ListAppsQueryType;
  preloaded?: PreloadedAppsTableDataWithDomainRefs | undefined;
  organization_id?: string;
  isOrgOwner?: boolean;
  /**
   * For the "accessible" query: ids of the organizations in which the
   * viewer is an owner/admin, used to decide which rows expose management
   * actions.
   */
  managedOrganizationIds?: readonly string[];
  /** Client-side filter on each row's resolved owner type. */
  ownerTypeFilter?: OwnerTypeFilterValue;
  /** Whether the "Create app" button is offered (default true). */
  canCreate?: boolean;
}

interface AppsTableHeaderButtonsProps {
  queryType: ListAppsQueryType;
  isOrgOwner?: boolean;
  canCreate: boolean;
}

function AppsTableHeaderButtons({
  queryType,
  isOrgOwner,
  canCreate,
}: AppsTableHeaderButtonsProps): ReactElement {
  return (
    <>
      {queryType === "authorized" && ( // From a user's list of authorized apps, allow them to add more authorized apps
        <AuthorizeClientApplicationDialogTrigger />
      )}
      {canCreate &&
        (queryType === "all" ||
          queryType === "owned" ||
          queryType === "accessible" ||
          (queryType === "org" && isOrgOwner)) && <CreateAppDialogTrigger />}
    </>
  );
}

export function AppsTable({
  queryType,
  preloaded,
  organization_id,
  isOrgOwner,
  managedOrganizationIds,
  ownerTypeFilter,
  canCreate = true,
}: AppsDatatableProps): ReactElement {
  const auth = useAuth();
  const authClient = auth.ready ? auth.client.current : undefined;
  const apps: SWRResponse<readonly SchemaVaultsApp[], Error> = useAppsList({
    queryType,
    initialData: preloaded ? preloaded.apps : undefined,
    organization_id,
    authClient,
  });
  const { isLoading } = apps;
  const data = useOwnerTypeFilteredResources(apps.data, ownerTypeFilter);
  const columns = useMemo((): ColumnDef<SchemaVaultsApp>[] => {
    return getAppsTableColumns(
      queryType,
      preloaded,
      isOrgOwner,
      managedOrganizationIds,
    );
  }, [queryType, preloaded, isOrgOwner, managedOrganizationIds]);

  const HeaderButtons: FC = useMemo(() => {
    return function AppsTableHeaderButtonsWithQueryType() {
      return (
        <AppsTableHeaderButtons
          queryType={queryType}
          isOrgOwner={isOrgOwner}
          canCreate={canCreate}
        />
      );
    };
  }, [queryType, isOrgOwner, canCreate]);

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <Datatable<SchemaVaultsApp>
      data={[...(data ? (data.length > 0 ? data : []) : [])]}
      columns={columns}
      initialVisibleColumns={{
        actions: true,
        select: true,
        app_id: false,
        app_name: true,
        app_description: true,
        owner_organization_id: false,
        web: true,
        domains: true,
      }}
      searchColumn={[
        "app_id",
        "app_name",
        "app_description",
        "owner_organization_id",
      ]}
      HeaderButtons={HeaderButtons}
      datatypeLabel="App"
    />
  );
}

export default AppsTable;
