"use client";

import {
  type SchemaVaultsAppCallbackUrlRef,
  schemaVaultsAppCallbackUrlRefSchema,
} from "@schemavaults/app-definitions";
import type { SWRResponse } from "swr";
import useSWR from "swr";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-react-provider";

export function getUseAppCallbackUrlsListEndpoint(app_id: string) {
  return `/api/apps/${app_id}/callback-urls` as const;
}

export interface UseAppCallbackUrlsInput {
  app_id: string;
  authClient?: ISchemaVaultsAuthClient;
}

/**
 * An app's explicit callback (redirect) URLs, every environment, loaded
 * on demand through `GET /api/apps/{app_id}/callback-urls` (same
 * visibility as the domains listing). Keyed by that endpoint so a page
 * that changes the list can revalidate it with SWR's `mutate`.
 */
export function useAppCallbackUrls({
  app_id,
  authClient,
}: UseAppCallbackUrlsInput): SWRResponse<SchemaVaultsAppCallbackUrlRef[], Error> {
  return useSWR(
    getUseAppCallbackUrlsListEndpoint(app_id),
    async (): Promise<SchemaVaultsAppCallbackUrlRef[]> => {
      if (authClient) {
        return await authClient.listClientApplicationCallbackUrls(app_id);
      }

      // Fallback to a direct fetch while the auth client is not ready.
      const response = await fetch(getUseAppCallbackUrlsListEndpoint(app_id), {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(
          `Failed to list callback URLs (response status: ${response.status})`,
        );
      }
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        !body ||
        !("success" in body) ||
        !body.success ||
        !("list" in body)
      ) {
        throw new Error("Received failure response when listing callback URLs");
      }
      return schemaVaultsAppCallbackUrlRefSchema.array().parse(body.list);
    },
    { revalidateOnFocus: false },
  );
}

export default useAppCallbackUrls;
