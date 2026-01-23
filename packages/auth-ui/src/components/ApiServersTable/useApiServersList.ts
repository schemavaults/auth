import {
  useAppEnvironment,
  useAuth,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/auth-react-provider";
import { useToast } from "@schemavaults/ui";
import useSWR, { useSWRConfig } from "swr";
import type { AccessToken } from "@schemavaults/auth-common";
import {
  type ListApiServersQueryResponse,
  type ListApiServersQueryType,
  SCHEMAVAULTS_AUTH_APP_DEFINITION,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";

export interface UseApiServersListOptions {
  queryType: ListApiServersQueryType;
  toast: ReturnType<typeof useToast>["toast"];
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
  toast,
  queryType,
  initialData,
  organization_id,
}: UseApiServersListOptions) {
  const auth = useAuth();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();
  const endpoint = getApiServersListEndpoint(queryType, organization_id);

  return useSWR(
    endpoint,
    async () => {
      if (!auth.ready) {
        toast({
          variant: "destructive",
          title: "Auth client not ready",
          description: "Unable to acquire access token to list API servers",
        });
        throw new Error("Auth client not ready");
      }
      const authClient = auth.client.current;
      if (!authClient) {
        toast({
          variant: "destructive",
          title: "Auth client not ready",
          description: "Unable to acquire access token to list API servers",
        });
        throw new Error("Auth client not ready");
      }

      let auth_access_jwt: AccessToken;
      try {
        const auth_jwt = await authClient.acquireAccessToken({
          token_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
          audience: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
        });
        if (!auth_jwt) throw new Error("Failed to acquire auth access token");
        auth_access_jwt = auth_jwt;
      } catch (e: unknown) {
        console.error("[useApiServersList] ", e);
        toast({
          variant: "destructive",
          title: "Error loading authentication access token",
          description:
            e instanceof Error
              ? e.message
              : `Failed to prepare network request`,
        });
        throw e;
      }

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
          headers: new Headers({
            Authorization: `Bearer ${auth_access_jwt.token satisfies string}`,
          }),
          method: "GET",
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
