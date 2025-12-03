import { useAppEnvironment, useAuth, type SchemaVaultsAppEnvironment } from "@schemavaults/auth-react-provider";
import { useToast } from "@schemavaults/ui";
import useSWR, { useSWRConfig } from "swr";
import type { AccessToken } from "@schemavaults/auth-common";
import { type ListApiServersQueryResponse, type ListApiServersQueryType, SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";

export interface UseApiServersListOptions {
  queryType: ListApiServersQueryType;
  toast: ReturnType<typeof useToast>['toast'];
}

function getApiServersListEndpoint(queryType: ListApiServersQueryType): `/api/apis/list/${string}` {
  return `/api/apis/list/${queryType}` as const;
}

export function clearUseApiServersCache(mutate: ReturnType<typeof useSWRConfig>['mutate']) {
  mutate(
    (key: string) => key.startsWith("/api/apis/list"),
    undefined,
    { revalidate: true }
  );
}

export function useApiServersList({ toast, queryType }: UseApiServersListOptions) {
  const auth = useAuth();
  const environment: SchemaVaultsAppEnvironment = useAppEnvironment();

  const endpoint = getApiServersListEndpoint(queryType);

  return useSWR(endpoint, async () => {
    if (!auth.ready) {
      toast({
        variant: 'destructive',
        title: "Auth client not ready",
        description: "Unable to acquire access token to list API servers"
      });
      throw new Error("Auth client not ready");
    }
    const authClient = auth.client.current;
    if (!authClient) {
      toast({
        variant: 'destructive',
        title: "Auth client not ready",
        description: "Unable to acquire access token to list API servers"
      });
      throw new Error("Auth client not ready");
    }

    let auth_access_jwt: AccessToken;
    try {
      const auth_jwt = await authClient.acquireAccessToken({
        token_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
        audience: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id
      });
      if (!auth_jwt) throw new Error("Failed to acquire auth access token");
      auth_access_jwt = auth_jwt;
    } catch (e: unknown) {
      console.error("[useApiServersList] ", e);
      toast({
        variant: 'destructive',
        title: "Error loading authentication access token",
        description: e instanceof Error ? e.message : `Failed to prepare network request`,
      });
      throw e;
    }

    try {
      const origin = window.location.origin;
      if (environment !== 'development' && environment !== 'test') {
        if (!origin.startsWith('https://')) throw new Error("Origin must use HTTPS in production")
      }
      if (environment === 'development') {
        console.log(`[useApiServersList] Sending request to endpoint "${endpoint}" from origin "${origin}"`)
      }
      const listAppsResponse = await fetch(endpoint, {
        headers: new Headers({
          Authorization: `Bearer ${auth_access_jwt.token satisfies string}`
        }),
        method: "POST"
      });
      if (!listAppsResponse.ok || listAppsResponse.status !== 200) throw new Error("Network request to list-apps endpoint failed");
      const listAppsBody: unknown = await listAppsResponse.json();
      if (typeof listAppsBody !== 'object') throw new Error("Failed to list API servers; response not an object");
      const listAppsResponseObject = listAppsBody as ListApiServersQueryResponse;
      if (!Object.hasOwn(listAppsResponseObject, 'success') || !listAppsResponseObject.success) {
        throw new Error("List API servers response has success = false");
      }
      return listAppsResponseObject.list;
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: "Error loading list of API servers",
        description: `${error instanceof Error ? error.message : "An unknown error occurred."}`,
      });
      throw error;
    }
  });
}
