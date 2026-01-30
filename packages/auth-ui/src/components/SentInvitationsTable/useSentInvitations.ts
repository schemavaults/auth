"use client";

import { useToast } from "@schemavaults/ui";
import useSWR, { type SWRResponse, useSWRConfig } from "swr";
import type { OrganizationInvitationWithUserData, OrganizationID } from "@schemavaults/auth-common";

export interface UseSentInvitationsOptions {
  organization_id: OrganizationID;
  toast: ReturnType<typeof useToast>["toast"];
  initialData?: readonly OrganizationInvitationWithUserData[] | undefined;
}

export function getSentInvitationsEndpoint(organization_id: OrganizationID): string {
  return `/api/organizations/${organization_id}/invitations`;
}

export function clearSentInvitationsCache(
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
  organization_id: OrganizationID
) {
  const endpoint = getSentInvitationsEndpoint(organization_id);
  mutate(
    (key: string) => key.startsWith(endpoint),
    undefined,
    {
      revalidate: true,
    }
  );
}

export function useSentInvitations({
  organization_id,
  toast,
  initialData,
}: UseSentInvitationsOptions): SWRResponse<readonly OrganizationInvitationWithUserData[]> {
  const endpoint = getSentInvitationsEndpoint(organization_id);

  return useSWR(
    endpoint,
    async (): Promise<readonly OrganizationInvitationWithUserData[]> => {
      try {
        const response = await fetch(endpoint, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Failed to list sent invitations (response status: ${response.status})!`
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
            "Received failure response when attempting to list sent invitations"
          );
        }
        if (
          !("data" in body) ||
          typeof body.data !== "object" ||
          !body.data ||
          !("invitations" in body.data) ||
          !Array.isArray(body.data.invitations)
        ) {
          throw new Error(
            "Failed to extract 'invitations' array from response!"
          );
        }

        return body.data.invitations as OrganizationInvitationWithUserData[];
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Error loading sent invitations",
          description: `${error instanceof Error ? error.message : "An unknown error occurred."}`,
        });
        throw error;
      }
    },
    {
      fallbackData: initialData ? [...initialData] : undefined,
    }
  );
}

export default useSentInvitations;
