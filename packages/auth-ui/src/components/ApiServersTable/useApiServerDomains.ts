"use client";

import { type SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";
import type { SWRResponse } from "swr";
import useSWR from "swr";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-react-provider";

export function getUseApiServerDomainsListEndpoint(api_server_id: string) {
  return `/api/apis/${api_server_id}/domains` as const;
}

// Pass either api_server_id, or api_server_id with options
export interface UseApiServerDomainsInput {
  api_server_id: string;
  initialData?: readonly SchemaVaultsApiServerDomainRef[];
  authClient?: ISchemaVaultsAuthClient;
}

export function useApiServerDomains(
  input: UseApiServerDomainsInput,
): SWRResponse<SchemaVaultsApiServerDomainRef[], Error> {
  const api_server_id: string = input.api_server_id;
  const authClient = input.authClient;

  return useSWR(
    getUseApiServerDomainsListEndpoint(api_server_id),
    async (): Promise<SchemaVaultsApiServerDomainRef[]> => {
      if (authClient) {
        return await authClient.listApiServerDomains(api_server_id);
      }

      // Fallback to direct fetch if no authClient provided
      const response = await fetch(
        getUseApiServerDomainsListEndpoint(api_server_id),
        {
          method: "GET",
          credentials: "include",
        },
      );
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
