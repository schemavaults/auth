"use client";

import { useCallback } from "react";
import { useToast } from "@schemavaults/ui";
import useSWR, { type SWRResponse, useSWRConfig } from "swr";
import type { OrganizationMembershipRoleDetails } from "@schemavaults/auth-common";
import {
  useAuth,
  type ISchemaVaultsAuthClient,
} from "@schemavaults/auth-react-provider";

export type { OrganizationMembershipRoleDetails } from "@schemavaults/auth-common";

export interface UseMyOrganizationsOptions {
  enabled?: boolean;
  initialData?: readonly OrganizationMembershipRoleDetails[] | undefined;
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

export function useMyOrganizations({
  enabled = true,
  initialData,
}: UseMyOrganizationsOptions): SWRResponse<
  readonly OrganizationMembershipRoleDetails[]
> {
  const { toast } = useToast();
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
      toast({
        variant: "destructive",
        title: "Error loading organizations",
        description: `${error instanceof Error ? error.message : "An unknown error occurred."}`,
      });
      throw error;
    }
  }, [clientRef, toast]);

  return useSWR(
    ready ? MY_ORGANIZATIONS_SWR_KEY : null,
    fetcher,
    {
      fallbackData: initialData ? [...initialData] : undefined,
    },
  );
}

export default useMyOrganizations;
