"use client";

import type { AccessToken } from "@schemavaults/auth-common";
import { HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS, isHardcodedAppId, SCHEMAVAULTS_AUTH_APP_DEFINITION, type SchemaVaultsAppDomainRef, schemaVaultsAppDomainRefSchema } from "@schemavaults/app-definitions";
import { useAuth } from "@schemavaults/auth-react-provider";
import { toast } from "@schemavaults/ui";
import type { SWRResponse } from "swr";
import useSWR from "swr";

export function getUseAppDomainsListEndpoint(app_id: string) {
  return `/api/apps/domains/${app_id}/list` as const;
}

// Pass either app_id, or app_id with options
export interface UseAppDomainsInput {
  app_id: string;
  initialData?: readonly SchemaVaultsAppDomainRef[]
}

export function useAppDomains(input: UseAppDomainsInput): SWRResponse<SchemaVaultsAppDomainRef[], Error> {
  const app_id: string = typeof input === 'string' ? input : input.app_id;
  const auth = useAuth();

  return useSWR(getUseAppDomainsListEndpoint(app_id), async (): Promise<SchemaVaultsAppDomainRef[]> => {
    if (isHardcodedAppId(app_id)) {
      const hardcoded: SchemaVaultsAppDomainRef[] = HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS.filter(
        (a): boolean => (a.app_id === app_id)
      );
      return hardcoded;
    }

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

    const response = await fetch(
      getUseAppDomainsListEndpoint(app_id),
      {
        method: "POST",
        headers: new Headers({
          "Authorization": `Bearer ${auth_access_jwt.token}`
        })
      }
    );
    if (!response.ok || response.status !== 200) throw new Error(response.statusText);
    const body = await response.json();
    if (typeof body !== 'object') throw new Error('Invalid response body')
    if (!body.success) throw new Error(body.message);
    const parsed = schemaVaultsAppDomainRefSchema.array().parse(body.list);
    return parsed;
  }, {
    fallbackData: typeof input === 'string' ?
      undefined
      :
      (
        input.initialData ? [...input.initialData] : undefined
      )
  });
}
