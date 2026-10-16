"use client";

import { useCallback } from "react";
import useSWR, { type SWRResponse, useSWRConfig } from "swr";
import type { OrganizationMembershipRoleDetails } from "@schemavaults/auth-common";
import type { ISchemaVaultsAuthClient } from "@schemavaults/auth-client-sdk";
import useAuth from "@/hooks/use-auth";

export interface UseMyOrganizationsOptions {
  enabled?: boolean;
  initialData?: readonly OrganizationMembershipRoleDetails[] | undefined;
  onError?: (error: unknown) => void;
}

const MY_ORGANIZATIONS_SWR_KEY = "/api/me/organizations";

export function clearMyOrganizationsCache(
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
) {
  mutate(
    (key: string) => key.startsWith(MY_ORGANIZATIONS_SWR_KEY),
    undefined,
    {
      revalidate: true,
    },
  );
}

/**
 * The signed-in user's organization memberships (`GET /api/me/organizations`).
 * Only works on the auth server's own frontend: on any other client app the
 * request fails with `MyOrganizationMembershipsUnavailableError`, since the
 * auth server never issues tokens for its own API to other apps. Resource
 * servers list memberships server-side instead (`listUserOrganizations()` /
 * `ctx.auth.listOrganizationMemberships()` in `@schemavaults/auth-server-sdk`)
 * and expose them through their own API.
 */
export function useMyOrganizations({
  enabled = true,
  initialData,
  onError,
}: UseMyOrganizationsOptions = {}): SWRResponse<
  readonly OrganizationMembershipRoleDetails[]
> {
  const auth = useAuth();
  const clientRef = auth.ready ? auth.client : null;
  const ready: boolean = !!(enabled && auth.ready && clientRef?.current);

  const fetcher = useCallback(async (): Promise<
    readonly OrganizationMembershipRoleDetails[]
  > => {
    const authClient: ISchemaVaultsAuthClient | null =
      clientRef?.current ?? null;
    if (!authClient) {
      throw new Error(
        "Auth client is not available to list organization memberships",
      );
    }
    try {
      return await authClient.listMyOrganizationMemberships();
    } catch (error: unknown) {
      onError?.(error);
      throw error;
    }
  }, [clientRef, onError]);

  return useSWR(
    ready ? MY_ORGANIZATIONS_SWR_KEY : null,
    fetcher,
    {
      fallbackData: initialData ? [...initialData] : undefined,
    },
  );
}

export default useMyOrganizations;
