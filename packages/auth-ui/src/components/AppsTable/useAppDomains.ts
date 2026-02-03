"use client";

import {
  HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS,
  isHardcodedAppId,
  type SchemaVaultsAppDomainRef,
  schemaVaultsAppDomainRefSchema,
} from "@schemavaults/app-definitions";
import type { SWRResponse } from "swr";
import useSWR from "swr";

export function getUseAppDomainsListEndpoint(app_id: string) {
  return `/api/apps/${app_id}/domains` as const;
}

// Pass either app_id, or app_id with options
export interface UseAppDomainsInput {
  app_id: string;
  initialData?: readonly SchemaVaultsAppDomainRef[];
}

export function useAppDomains(
  input: UseAppDomainsInput,
): SWRResponse<SchemaVaultsAppDomainRef[], Error> {
  const app_id: string = typeof input === "string" ? input : input.app_id;

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

      const response = await fetch(getUseAppDomainsListEndpoint(app_id), {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok || response.status !== 200)
        throw new Error(response.statusText);
      const body = await response.json();
      if (typeof body !== "object") throw new Error("Invalid response body");
      if (!body.success) throw new Error(body.message);
      const parsed = schemaVaultsAppDomainRefSchema.array().parse(body.list);
      return parsed;
    },
    {
      fallbackData:
        typeof input === "string"
          ? undefined
          : input.initialData
            ? [...input.initialData]
            : undefined,
    },
  );
}
