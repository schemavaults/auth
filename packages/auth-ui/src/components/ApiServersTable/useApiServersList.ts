import {
  useAppEnvironment,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/auth-react-provider";
import { useToast } from "@schemavaults/ui";
import useSWR, { useSWRConfig } from "swr";
import {
  type ListApiServersQueryResponse,
  type ListApiServersQueryType,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";

export interface UseApiServersListOptions {
  queryType: ListApiServersQueryType;
  initialData?: readonly SchemaVaultsApiServerDefinition[] | undefined;
  organization_id?: string;
}

function getApiServersListEndpoint(
  queryType: ListApiServersQueryType,
  organization_id?: string,
): `/api/apis?${string}` {
  const searchParams = new URLSearchParams();
  searchParams.set("list_apis_query_type", queryType);
  if (queryType === "org" && organization_id) {
    searchParams.set("organization_id", organization_id);
  }
  return `/api/apis?${searchParams.toString()}` as const;
}

export function clearUseApiServersCache(
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
) {
  mutate((key: string) => key.startsWith("/api/apis"), undefined, {
    revalidate: true,
  });
}

export function useApiServersList({
  queryType,
  initialData,
  organization_id,
}: UseApiServersListOptions) {
  const { toast } = useToast();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const endpoint = getApiServersListEndpoint(queryType, organization_id);

  return useSWR(
    endpoint,
    async () => {
      try {
        const origin = window.location.origin;
        if (environment !== "development" && environment !== "test") {
          if (!origin.startsWith("https://"))
            throw new Error("Origin must use HTTPS in production");
        }
        if (environment === "development") {
          console.log(
            `[useApiServersList] Sending request to endpoint "${endpoint}" from origin "${origin}"`,
          );
        }
        const listApiServersResponse: Response = await fetch(endpoint, {
          method: "GET",
          credentials: "include",
        });
        if (!listApiServersResponse.ok || listApiServersResponse.status !== 200)
          throw new Error("Network request to list-apps endpoint failed");
        const listAppsBody: unknown = await listApiServersResponse.json();
        if (typeof listAppsBody !== "object")
          throw new Error("Failed to list API servers; response not an object");
        const listAppsResponseObject =
          listAppsBody as ListApiServersQueryResponse;
        if (
          !Object.hasOwn(listAppsResponseObject, "success") ||
          !listAppsResponseObject.success
        ) {
          throw new Error("List API servers response has success = false");
        }
        const apiServersList: readonly SchemaVaultsApiServerDefinition[] =
          listAppsResponseObject.list;

        if (environment === "development") {
          console.log(
            "[useApiServersList] Received list of API servers: ",
            apiServersList,
          );
        }

        return apiServersList;
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Error loading list of API servers",
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

export default useApiServersList;
