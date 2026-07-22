"use client";

import type { ReactElement } from "react";
import Link from "next/link";

import type { ColumnDef } from "@schemavaults/ui";
import { Checkbox } from "@schemavaults/ui";
import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";
import { ApiServerRowActions } from "./ApiServerRowActions";
import ApiServerDomainsList from "./ApiServerDomainsList";
import type { PreloadedApiServersTableDataWithDomainRefs } from "./preloaded_api_servers_table_data";

export function getApiServersTableColumns(
  preloaded?: PreloadedApiServersTableDataWithDomainRefs,
): ColumnDef<SchemaVaultsApiServerDefinition>[] {
  const columns: ColumnDef<SchemaVaultsApiServerDefinition>[] = [
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
      id: "api_server_id",
      accessorKey: "api_server_id",
      header: "API Server ID",
      cell: ({ row }): ReactElement => {
        const api = row.original;
        return (
          <Link href={`/apis/${api.api_server_id}`} className="hover:underline text-primary">
            {api.api_server_id}
          </Link>
        );
      },
    },
    {
      id: "api_server_name",
      accessorKey: "api_server_name",
      header: "API Server Name",
      cell: ({ row }): ReactElement => {
        const api = row.original;
        return (
          <Link href={`/apis/${api.api_server_id}`} className="hover:underline text-primary">
            {api.api_server_name}
          </Link>
        );
      },
    },
    {
      id: "api_server_description",
      accessorKey: "api_server_description",
      header: "Description",
    },
    {
      id: "owner_organization_id",
      accessorKey: "owner_organization_id",
      header: "Owner Organization",
    },
    {
      id: "domains",
      header: "Domains",
      cell: ({ row }) => {
        let api_server_id: string | undefined = undefined;
        try {
          const id: unknown = row.getValue("api_server_id");
          if (typeof id !== "string") {
            throw new Error("Expected ID to be a string");
          }
          api_server_id = id;
        } catch (e: unknown) {
          console.error(
            "Failed to load API server ID for 'domains' cell in ApiServersTable: ",
            e,
          );
          api_server_id = undefined;
        }

        if (typeof api_server_id !== "string") {
          return (
            <p className="text-destructive">
              Invalid API server ID; not a string
            </p>
          );
        }

        return (
          <ApiServerDomainsList
            api_server_id={api_server_id}
            preloaded_domains={
              typeof preloaded === "object" && !!preloaded
                ? preloaded.domains[api_server_id]
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
        const api = row.original;
        return <ApiServerRowActions api={api} />;
      },
    },
  ];
  return columns;
}
