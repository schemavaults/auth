"use client";

import type { ReactElement } from "react";

import type { ColumnDef } from "@schemavaults/ui";
import { Checkbox } from "@schemavaults/ui";
import Link from "next/link";
import type {
  ListAppsQueryType,
  SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import { FrontendApplicationActions } from "./frontend_app_actions";
import AppDomainsList from "./AppDomainsList";
import type { PreloadedAppsTableDataWithDomainRefs } from "./preloaded_apps_table_data";
import { AppWindowMac, Globe } from "lucide-react";

export function getAppsTableColumns(
  queryType: ListAppsQueryType,
  preloaded?: PreloadedAppsTableDataWithDomainRefs,
  isOrgOwner?: boolean,
): ColumnDef<SchemaVaultsApp>[] {
  const columns: ColumnDef<SchemaVaultsApp>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value: boolean) =>
            table.toggleAllPageRowsSelected(!!value)
          }
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "app_id",
      accessorKey: "app_id",
      header: "App ID",
      cell: ({ row }): ReactElement => {
        const app = row.original;
        return (
          <Link href={`/apps/${app.app_id}`} className="hover:underline text-primary">
            {app.app_id}
          </Link>
        );
      },
    },
    {
      id: "app_name",
      accessorKey: "app_name",
      header: "App Name",
      cell: ({ row }): ReactElement => {
        const app = row.original;
        return (
          <Link href={`/apps/${app.app_id}`} className="hover:underline text-primary">
            {app.app_name}
          </Link>
        );
      },
    },
    {
      id: "app_description",
      accessorKey: "app_description",
      header: "Description",
    },
    {
      id: "owner_organization_id",
      accessorKey: "owner_organization_id",
      header: "Owner Organization",
    },
    {
      id: "web",
      accessorKey: "web",
      header: "App Type",
      cell: ({ row }) => {
        const web: boolean = row.getValue("web");
        return (
          <div className="flex flex-row gap-2 items-center justify-center">
            {web ? (
              <Globe className="h-4 w-4" />
            ) : (
              <AppWindowMac className="h-4 w-4" />
            )}
            {web ? <p>Web</p> : <p>Native</p>}
          </div>
        );
      },
    },
    {
      id: "domains",
      header: "Domains",
      cell: ({ row }) => {
        let app_id: string | undefined = undefined;
        try {
          const id: unknown = row.getValue("app_id");
          if (typeof id !== "string") {
            throw new Error("Expected ID to be a string");
          }
          app_id = id;
        } catch (e: unknown) {
          console.error(
            "Failed to load app ID for 'domains' cell in AppsTable: ",
            e,
          );
          app_id = undefined;
        }

        if (typeof app_id !== "string") {
          return (
            <p className="text-destructive">Invalid app ID; not a string</p>
          );
        }

        return (
          <AppDomainsList
            app_id={app_id}
            preloaded_domains={
              typeof preloaded === "object" && !!preloaded
                ? preloaded.domains[app_id]
                : undefined
            }
          />
        );
      },
      enableSorting: false,
      enableHiding: true,
    },
    {
      id: "actions",
      cell: ({ row }): ReactElement => {
        const app: SchemaVaultsApp = row.original;

        return <FrontendApplicationActions app={app} queryType={queryType} isOrgOwner={isOrgOwner} />;
      },
    },
  ];
  return columns;
}
