"use client";

import { useToast } from "@schemavaults/ui";
import useSWR, { type SWRResponse, useSWRConfig } from "swr";
import type { UserPendingInvitation } from "@schemavaults/auth-common";

export interface UsePendingInvitationsOptions {
  toast: ReturnType<typeof useToast>["toast"];
  initialData?: readonly UserPendingInvitation[] | undefined;
}

const LIST_PENDING_INVITATIONS_ENDPOINT = "/api/me/invitations";

export function clearPendingInvitationsCache(
  mutate: ReturnType<typeof useSWRConfig>["mutate"]
) {
  mutate(
    (key: string) => key.startsWith(LIST_PENDING_INVITATIONS_ENDPOINT),
    undefined,
    {
      revalidate: true,
    }
  );
}

export function usePendingInvitations({
  toast,
  initialData,
}: UsePendingInvitationsOptions): SWRResponse<readonly UserPendingInvitation[]> {
  return useSWR(
    LIST_PENDING_INVITATIONS_ENDPOINT,
    async (): Promise<readonly UserPendingInvitation[]> => {
      try {
        const response = await fetch(LIST_PENDING_INVITATIONS_ENDPOINT, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Failed to list pending invitations (response status: ${response.status})!`
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
            "Received failure response when attempting to list pending invitations"
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

        return body.data.invitations as UserPendingInvitation[];
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Error loading pending invitations",
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

export default usePendingInvitations;
