"use client";

import { useToast } from "@schemavaults/ui";
import useSWR, { type SWRResponse, useSWRConfig } from "swr";

export interface MyOrganizationMembership {
  organization_id: string;
  organization_name: string;
  role: string;
  created_at: number;
}

export interface UseMyOrganizationsOptions {
  enabled?: boolean;
  initialData?: readonly MyOrganizationMembership[] | undefined;
}

const MY_ORGANIZATIONS_ENDPOINT = "/api/me/organizations";

export function clearMyOrganizationsCache(
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
) {
  mutate(
    (key: string) => key.startsWith(MY_ORGANIZATIONS_ENDPOINT),
    undefined,
    {
      revalidate: true,
    },
  );
}

export function useMyOrganizations({
  enabled = true,
  initialData,
}: UseMyOrganizationsOptions): SWRResponse<readonly MyOrganizationMembership[]> {
  const { toast } = useToast();

  return useSWR(
    enabled ? MY_ORGANIZATIONS_ENDPOINT : null,
    async (): Promise<readonly MyOrganizationMembership[]> => {
      try {
        const response = await fetch(MY_ORGANIZATIONS_ENDPOINT, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Failed to list user organizations (response status: ${response.status})!`,
          );
        }
        const body: unknown = await response.json();
        if (
          typeof body !== "object" ||
          !body ||
          !("success" in body) ||
          !body.success
        ) {
          throw new Error(
            "Received failure response when attempting to list user organizations",
          );
        }
        if (
          !("data" in body) ||
          typeof body.data !== "object" ||
          !body.data ||
          !("memberships" in body.data) ||
          !Array.isArray(body.data.memberships)
        ) {
          throw new Error(
            "Failed to extract 'memberships' array from response!",
          );
        }

        return body.data.memberships as MyOrganizationMembership[];
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Error loading organizations",
          description: `${error instanceof Error ? error.message : "An unknown error occurred."}`,
        });
        throw error;
      }
    },
    {
      fallbackData: initialData ? [...initialData] : undefined,
    },
  );
}

export default useMyOrganizations;
