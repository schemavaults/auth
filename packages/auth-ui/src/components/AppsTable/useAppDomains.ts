"use client";

import {
  isHardcodedAppId,
  HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS,
  type SchemaVaultsAppDomainRef,
} from "@schemavaults/app-definitions";
import type { SWRResponse } from "swr";
import useSWR from "swr";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-react-provider";

export function getUseAppDomainsListEndpoint(app_id: string) {
  return `/api/apps/${app_id}/domains` as const;
}

// Pass either app_id, or app_id with options
export interface UseAppDomainsInput {
  app_id: string;
  initialData?: readonly SchemaVaultsAppDomainRef[];
  authClient?: ISchemaVaultsAuthClient;
}

export function useAppDomains(
  input: UseAppDomainsInput,
): SWRResponse<SchemaVaultsAppDomainRef[], Error> {
  const app_id: string = input.app_id;
  const authClient = input.authClient;

  return useSWR(
    getUseAppDomainsListEndpoint(app_id),
    async (): Promise<SchemaVaultsAppDomainRef[]> => {
      if (isHardcodedAppId(app_id)) {
        const hardcoded: SchemaVaultsAppDomainRef[] =
          HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS.filter(
            (a): boolean => a.app_id === app_id,
          );
        return hardcoded;
      }

      if (authClient) {
        return await authClient.listClientApplicationDomains(app_id);
      }

      // Fallback to direct fetch if no authClient provided
      const response = await fetch(getUseAppDomainsListEndpoint(app_id), {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok || response.status !== 200)
        throw new Error(response.statusText);
      const body = await response.json();
      if (typeof body !== "object") throw new Error("Invalid response body");
      if (!body.success) throw new Error(body.message);
      return body.list;
    },
    {
      fallbackData: input.initialData ? [...input.initialData] : undefined,
    },
  );
}
