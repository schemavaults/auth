"use client";

import { useToast } from "@schemavaults/ui";
import useSWR, { type SWRResponse, useSWRConfig } from "swr";
import {
  inviteCodeDefinitionSchema,
  type InviteCodeDefinition,
} from "@schemavaults/auth-common";

export interface UseAllInviteCodesOptions {
  toast: ReturnType<typeof useToast>["toast"];
  initialData?: readonly InviteCodeDefinition[] | undefined;
}

const LIST_ALL_INVITE_CODES_ENDPOINT = "/api/admin/invite-codes";

export function clearUseAllInviteCodesCache(
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
) {
  mutate(
    (key: string) => key.startsWith(LIST_ALL_INVITE_CODES_ENDPOINT),
    undefined,
    {
      revalidate: true,
    },
  );
}

export function useAllInviteCodes({
  toast,
  initialData,
}: UseAllInviteCodesOptions): SWRResponse<readonly InviteCodeDefinition[]> {
  return useSWR(
    LIST_ALL_INVITE_CODES_ENDPOINT,
    async (): Promise<readonly InviteCodeDefinition[]> => {
      try {
        const response = await fetch(LIST_ALL_INVITE_CODES_ENDPOINT, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Failed to list invite codes (response status: ${response.status})!`,
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
            "Received failure response when attempting to list invite codes",
          );
        }
        if (
          !("data" in body) ||
          typeof body.data !== "object" ||
          !body.data ||
          !("invite_codes" in body.data) ||
          !Array.isArray(body.data.invite_codes)
        ) {
          throw new Error(
            "Failed to extract 'invite_codes' array from response!",
          );
        }
        const parsed_invite_codes = await inviteCodeDefinitionSchema
          .array()
          .safeParseAsync(body.data.invite_codes);

        if (!parsed_invite_codes.success) {
          console.error(
            `Failed to parse 'invite_codes' from response object: `,
            parsed_invite_codes.error,
          );
          throw new Error(
            "Failed to parse 'invite_codes' from response object!",
          );
        }

        return parsed_invite_codes.data;
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Error loading invite codes",
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

export default useAllInviteCodes;
