"use client";

import { useMemo, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { useToast } from "@schemavaults/ui";
import { Datatable } from "@schemavaults/ui";
import { getAppsTableColumns } from "./columns";
import { clearUseAppsListCache, useAppsList } from "./useAppsList";
import type {
  ListAppsQueryType,
  SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import { SCHEMAVAULTS_ORGANIZATION_ID } from "@schemavaults/auth-common";
import { CreateAppDialog } from "../CreateAppDialog";
import { Loader2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PreloadedAppsTableDataWithDomainRefs } from "./preloaded_apps_table_data";

export interface AppsDatatableProps {
  queryType: ListAppsQueryType;
  preloaded?: PreloadedAppsTableDataWithDomainRefs | undefined;
  organization_id?: string;
}

export function AppsTable({
  queryType,
  preloaded,
  organization_id,
}: AppsDatatableProps): ReactElement {
  const { toast } = useToast();
  const apps: SWRResponse<readonly SchemaVaultsApp[], Error> = useAppsList({
    toast,
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
        domains: true,
      }}
      searchColumn={["app_id", "app_name"]}
      HeaderButtons={(): ReactElement => {
        return (
          <>
            {(queryType === "all" || queryType === "org") && (
              <CreateAppDialog
                clearFrontendAppsCache={clearUseAppsListCache}
                owner_organization_id={
                  queryType === "all"
                    ? SCHEMAVAULTS_ORGANIZATION_ID
                    : organization_id
                }
              />
            )}
          </>
        );
      }}
      datatypeLabel="App"
    />
  );
}

export default AppsTable;
