import { useAppEnvironment, useAuth, type SchemaVaultsAppEnvironment } from "@schemavaults/auth-react-provider";
import { useToast } from "@schemavaults/ui";
import useSWR, { useSWRConfig } from "swr";
import type { AccessToken } from "@schemavaults/auth-common";
import { type ListAppsQueryResponse, type ListAppsQueryType, SCHEMAVAULTS_AUTH_APP_DEFINITION, type SchemaVaultsApp } from "@schemavaults/app-definitions";

export interface UseAppsListOptions {
  queryType: ListAppsQueryType;
  toast: ReturnType<typeof useToast>['toast'];
  initialData?: readonly SchemaVaultsApp[] | undefined;
}

function getAppsListEndpoint(queryType: ListAppsQueryType): `/api/apps/list/${string}` {
  return `/api/apps/list/${queryType}` as const;
}

export function clearUseAppsListCache(mutate: ReturnType<typeof useSWRConfig>['mutate']) {
  mutate(
    (key: string) => key.startsWith("/api/apps/list"),
    undefined,
    { revalidate: true }
  );
}

export function useAppsList({ toast, queryType, initialData }: UseAppsListOptions) {
  const auth = useAuth();
  const environment = useAppEnvironment();
  const endpoint = getAppsListEndpoint(queryType);

  return useSWR(endpoint, async () => {
    if (!auth.ready) {
      toast({
        variant: 'destructive',
        title: "Auth client not ready",
        description: "Unable to acquire access token to list apps"
      });
      throw new Error("Auth client not ready");
    }
    const authClient = auth.client.current;
    if (!authClient) {
      toast({
        variant: 'destructive',
        title: "Auth client not ready",
        description: "Unable to acquire access token to list apps"
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
      console.error("[useAppsList] ", e);
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
        if (!origin.startsWith('https://')) throw new Error("Origin must be HTTPS in production")
      }
      if (environment === 'development') {
        console.log(`[useAppsList] Sending request to endpoint \"${endpoint}\" from origin \"${origin}\"`)
      }
      const listAppsResponse = await fetch(endpoint, {
        headers: new Headers({
          Authorization: `Bearer ${auth_access_jwt.token satisfies string}`
        }),
        method: "POST"
      });
      if (!listAppsResponse.ok || listAppsResponse.status !== 200) throw new Error("Network request to list-apps endpoint failed");
      const listAppsBody: unknown = await listAppsResponse.json();
      if (typeof listAppsBody !== 'object') throw new Error("Failed to list apps; response not an object");
      const listAppsResponseObject = listAppsBody as ListAppsQueryResponse;
      if (!listAppsResponseObject.hasOwnProperty('success') || !listAppsResponseObject.success) {
        throw new Error("List apps response has success = false");
      }
      return listAppsResponseObject.list;
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: "Error loading list of apps",
        description: `${error instanceof Error ? error.message : "An unknown error occurred."}`,
      });
      throw error;
    }
  }, {
    fallbackData: initialData ? [...initialData] : undefined
  });
}
