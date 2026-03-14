"use client";

import { useToast } from "@schemavaults/ui";
import useSWR, { type SWRResponse, useSWRConfig } from "swr";
import {
  type ListAppsQueryType,
  type SchemaVaultsApp,
} from "@schemavaults/app-definitions";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-react-provider";

export interface UseAppsListOptions {
  queryType: ListAppsQueryType;
  initialData?: readonly SchemaVaultsApp[] | undefined;
  organization_id?: string;
  authClient: ISchemaVaultsAuthClient | null | undefined;
}

function getAppsListEndpoint(
  queryType: ListAppsQueryType,
  organization_id?: string,
): `/api/apps?${string}` {
  const searchParams = new URLSearchParams();
  searchParams.set("list_apps_query_type", queryType);
  if (queryType === "org" && organization_id) {
    searchParams.set("organization_id", organization_id);
  }
  return `/api/apps?${searchParams.toString()}` as const;
}

export function clearUseAppsListCache(
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
) {
  mutate((key: string) => key.startsWith("/api/apps"), undefined, {
    revalidate: true,
  });
}

export function useAppsList({
  queryType,
  initialData,
  organization_id,
  authClient,
}: UseAppsListOptions): SWRResponse<readonly SchemaVaultsApp[]> {
  const { toast } = useToast();
  const endpoint = getAppsListEndpoint(queryType, organization_id);

  return useSWR(
    authClient ? endpoint : null,
    async () => {
      try {
        const queryParams = new URLSearchParams();
        if (queryType === "org" && organization_id) {
          queryParams.set("organization_id", organization_id);
        }

        const response = await authClient!.listClientApplications(
          queryType,
          queryParams,
        );

        if (!response.success) {
          throw new Error("List apps response has success = false");
        }

        const appsList: readonly SchemaVaultsApp[] = response.list;

        if (process.env.NODE_ENV === "development") {
          console.log("[useAppsList] Received list of apps: ", appsList);
        }

        return appsList;
      } catch (error: unknown) {
        console.error("Error loading list of apps: ", error);
        toast({
          variant: "destructive",
          title: "Error loading list of apps",
          description: `${error instanceof Error ? error.message : "An unknown error occurred."}`,
        });
        throw error;
      }
    },
    {
      fallbackData: initialData ? [...initialData] : undefined,
    },
  );
}

export default useAppsList;
