"use client";

import { useContext, useMemo, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { getAppsTableColumns } from "./columns";
import { useAppsList } from "./useAppsList";
import type {
  ListAppsQueryType,
  SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import {
  CreateAppDialogOpenDispatchContext,
  CreateAppDialogTrigger,
} from "@/components/CreateAppDialog";
import { Loader2 } from "lucide-react";
import type { ColumnDef } from "@schemavaults/ui";
import type { PreloadedAppsTableDataWithDomainRefs } from "./preloaded_apps_table_data";

export interface AppsDatatableProps {
  queryType: ListAppsQueryType;
  preloaded?: PreloadedAppsTableDataWithDomainRefs | undefined;
  organization_id?: string;
}

function AppsTableHeaderButtons(): ReactElement {
  const onOpenChange = useContext(CreateAppDialogOpenDispatchContext);
  return <CreateAppDialogTrigger onOpenChange={onOpenChange} />;
}

export function AppsTable({
  queryType,
  preloaded,
  organization_id,
}: AppsDatatableProps): ReactElement {
  const apps: SWRResponse<readonly SchemaVaultsApp[], Error> = useAppsList({
    queryType,
    initialData: preloaded ? preloaded.apps : undefined,
    organization_id,
  });
  const { isLoading, data } = apps;
  const columns = useMemo((): ColumnDef<SchemaVaultsApp>[] => {
    return getAppsTableColumns(queryType, preloaded);
  }, [queryType, preloaded]);

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
      HeaderButtons={AppsTableHeaderButtons}
      datatypeLabel="App"
    />
  );
}

export default AppsTable;
