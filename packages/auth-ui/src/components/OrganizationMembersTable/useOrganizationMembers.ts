"use client";

import useSWR, { type SWRResponse } from "swr";
import type { OrganizationID } from "@schemavaults/auth-common";
import type { OrganizationMemberTableData } from "./columns";

export function getOrganizationMembersEndpoint(
  organization_id: OrganizationID,
): string {
  return `/api/organizations/${organization_id}/members`;
}

export interface UseOrganizationMembersOptions {
  preloaded?: readonly OrganizationMemberTableData[];
}

export function useOrganizationMembers(
  organization_id: OrganizationID,
  { preloaded }: UseOrganizationMembersOptions = {},
): SWRResponse<readonly OrganizationMemberTableData[], Error> {
  const listOrganizationMembersEndpoint =
    getOrganizationMembersEndpoint(organization_id);

  return useSWR(
    listOrganizationMembersEndpoint,
    async (): Promise<readonly OrganizationMemberTableData[]> => {
      try {
        const response = await fetch(listOrganizationMembersEndpoint, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Failed to list organization members (response status: ${response.status})!`,
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
            "Received failure response when attempting to list organization members",
          );
        }
        if (
          !("data" in body) ||
          typeof body.data !== "object" ||
          !body.data ||
          !("members" in body.data) ||
          !Array.isArray(body.data.members)
        ) {
          throw new Error("Failed to extract 'members' array from response!");
        }

        const members: readonly OrganizationMemberTableData[] = body.data
          .members as OrganizationMemberTableData[];
        return members;
      } catch (e: unknown) {
        console.error(`Failed to list organization members: `, e);
        throw new Error(`Failed to list organization members!`);
      }
    },
    {
      fallbackData: preloaded,
    },
  );
}

export default useOrganizationMembers;
