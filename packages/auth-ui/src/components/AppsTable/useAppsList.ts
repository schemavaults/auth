"use client";

import { useAppEnvironment } from "@schemavaults/auth-react-provider";
import { useToast } from "@schemavaults/ui";
import useSWR, { type SWRResponse, useSWRConfig } from "swr";
import {
  type ListAppsQueryResponse,
  type ListAppsQueryType,
  type SchemaVaultsApp,
} from "@schemavaults/app-definitions";

export interface UseAppsListOptions {
  queryType: ListAppsQueryType;
  initialData?: readonly SchemaVaultsApp[] | undefined;
  organization_id?: string;
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
}: UseAppsListOptions): SWRResponse<readonly SchemaVaultsApp[]> {
  const { toast } = useToast();
  const environment = useAppEnvironment();
  const endpoint = getAppsListEndpoint(queryType, organization_id);

  return useSWR(
    endpoint,
    async () => {
      try {
        const origin = window.location.origin;
        if (environment !== "development" && environment !== "test") {
          if (!origin.startsWith("https://"))
            throw new Error("Origin must be HTTPS in production");
        }
        if (environment === "development") {
          console.log(
            `[useAppsList] Sending request to endpoint "${endpoint}" from origin "${origin}"`,
          );
        }
        const listAppsResponse = await fetch(endpoint, {
          method: "GET",
          credentials: "include",
        });
        if (!listAppsResponse.ok || listAppsResponse.status !== 200)
          throw new Error("Network request to list-apps endpoint failed");
        const listAppsBody: unknown = await listAppsResponse.json();
        if (typeof listAppsBody !== "object")
          throw new Error("Failed to list apps; response not an object");
        const listAppsResponseObject = listAppsBody as ListAppsQueryResponse;
        if (
          !Object.hasOwn(listAppsResponseObject, "success") ||
          !listAppsResponseObject.success
        ) {
          throw new Error("List apps response has success = false");
        }
        const appsList: readonly SchemaVaultsApp[] =
          listAppsResponseObject.list;

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
