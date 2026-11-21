"use client";

import type { ApiServerDomainVerification } from "@schemavaults/app-definitions";
import type { SWRResponse } from "swr";
import useSWR from "swr";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-react-provider";
import { getUseApiServerDomainsListEndpoint } from "./useApiServerDomains";

/**
 * SWR key of {@link useApiServerDomainVerifications}: the domains list
 * endpoint (which carries the verifications) plus a marker, since
 * `useApiServerDomains` caches that endpoint's `list` under the bare URL.
 */
export function getUseApiServerDomainVerificationsKey(api_server_id: string) {
  return `${getUseApiServerDomainsListEndpoint(api_server_id)}#verifications` as const;
}

/**
 * Whether an SWR key caches an API server's domains or their verification
 * states: what a dialog that adds, removes or verifies a domain invalidates.
 */
export function isApiServerDomainsCacheKey(key: unknown, api_server_id: string): boolean {
  return (
    key === getUseApiServerDomainsListEndpoint(api_server_id) ||
    key === getUseApiServerDomainVerificationsKey(api_server_id)
  );
}

export interface UseApiServerDomainVerificationsInput {
  api_server_id: string;
  initialData?: readonly ApiServerDomainVerification[];
  authClient?: ISchemaVaultsAuthClient;
}

/**
 * @description The ownership verification state of an API server's domains
 * (`verifications` of `GET /api/apis/{api_server_id}/domains`).
 */
export function useApiServerDomainVerifications(
  input: UseApiServerDomainVerificationsInput,
): SWRResponse<ApiServerDomainVerification[], Error> {
  const { api_server_id, authClient } = input;
  return useSWR(
    getUseApiServerDomainVerificationsKey(api_server_id),
    async (): Promise<ApiServerDomainVerification[]> => {
      if (authClient) {
        return await authClient.listApiServerDomainVerifications(api_server_id);
      }
      const response = await fetch(getUseApiServerDomainsListEndpoint(api_server_id), {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) throw new Error(response.statusText);
      const body: unknown = await response.json();
      if (typeof body !== "object" || !body) throw new Error("Invalid response body");
      const verifications: unknown = (body as { verifications?: unknown }).verifications;
      // An auth server that predates domain verification reports none.
      return Array.isArray(verifications) ? (verifications as ApiServerDomainVerification[]) : [];
    },
    {
      fallbackData: input.initialData ? [...input.initialData] : undefined,
    },
  );
}
