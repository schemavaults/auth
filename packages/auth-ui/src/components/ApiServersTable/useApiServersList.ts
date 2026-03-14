import { useToast } from "@schemavaults/ui";
import useSWR, { useSWRConfig } from "swr";
import {
  type ListApiServersQueryType,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-react-provider";

export interface UseApiServersListOptions {
  queryType: ListApiServersQueryType;
  initialData?: readonly SchemaVaultsApiServerDefinition[] | undefined;
  organization_id?: string;
  authClient: ISchemaVaultsAuthClient;
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
  authClient,
}: UseApiServersListOptions) {
  const { toast } = useToast();
  const endpoint = getApiServersListEndpoint(queryType, organization_id);

  return useSWR(
    endpoint,
    async () => {
      try {
        const queryParams = new URLSearchParams();
        if (queryType === "org" && organization_id) {
          queryParams.set("organization_id", organization_id);
        }

        const response = await authClient.listApiServers(
          queryType,
          queryParams,
        );

        if (!response.success) {
          throw new Error("List API servers response has success = false");
        }

        const apiServersList: readonly SchemaVaultsApiServerDefinition[] =
          response.list;

        if (process.env.NODE_ENV === "development") {
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
