
"use client";

import { useMemo, type ReactElement } from "react";
import type { SWRResponse} from "swr";
import { useToast } from "@schemavaults/ui";
import { Datatable } from "@schemavaults/ui";
import { getAppsTableColumns } from "./columns";
import { clearUseAppsListCache, useAppsList } from "./useAppsList";
import type { ListAppsQueryType, SchemaVaultsApp, SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";
import { CreateAppDialog } from "../CreateAppDialog";
import { Loader2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { PreloadedAppsTableDataWithDomainRefs } from "./preloaded_apps_table_data";

export interface AppsDatatableProps {
  queryType: ListAppsQueryType;
  preloaded?: PreloadedAppsTableDataWithDomainRefs | undefined
}

export function AppsTable(
  { queryType, preloaded }: AppsDatatableProps
): ReactElement {
  const {toast} = useToast()
  const apps: SWRResponse<SchemaVaultsApp[], Error> = useAppsList({
    toast,
    queryType,
    initialData: (!!preloaded) ? preloaded.apps : undefined
  });
  const { isLoading, data, error } = apps;
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
      data={data ? (data.length > 0 ? data : []) : []}
      columns={columns}
      initialVisibleColumns={{
        actions: true,
        select: true,
        id: false,
        app_id: false,
        name: true,
        app_name: true,
        app_description: true,
      }}
      HeaderButtons={() => {
        return (
          <>
            {
              queryType === 'all' && (
                <CreateAppDialog
                  clearFrontendAppsCache={clearUseAppsListCache}
                />
              )
            }
          </>
        );
      }}
      datatypeLabel="App"
    />
  )
}
