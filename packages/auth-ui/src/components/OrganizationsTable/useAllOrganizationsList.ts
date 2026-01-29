"use client";

import { useToast } from "@schemavaults/ui";
import useSWR, { type SWRResponse, useSWRConfig } from "swr";
import {
  organizationDefinitionSchema,
  type OrganizationDefinition,
} from "@schemavaults/auth-common";

export interface UseAllOrganizationsListOptions {
  initialData?: readonly OrganizationDefinition[] | undefined;
}

const LIST_ALL_ORGANIZATIONS_ENDPOINT = "/api/organizations";

export function clearUseAllOrganizationsListCache(
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
) {
  mutate(
    (key: string) => key.startsWith(LIST_ALL_ORGANIZATIONS_ENDPOINT),
    undefined,
    {
      revalidate: true,
    },
  );
}

export function useAllOrganizationsList({
  initialData,
}: UseAllOrganizationsListOptions): SWRResponse<
  readonly OrganizationDefinition[]
> {
  const { toast } = useToast();

  return useSWR(
    LIST_ALL_ORGANIZATIONS_ENDPOINT,
    async (): Promise<readonly OrganizationDefinition[]> => {
      try {
        const response = await fetch(LIST_ALL_ORGANIZATIONS_ENDPOINT, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Failed to list organizations (response status: ${response.status})!`,
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
            "Received failure response when attempting to list organizations",
          );
        }
        if (
          !("data" in body) ||
          typeof body.data !== "object" ||
          !body.data ||
          !("organizations" in body.data) ||
          !Array.isArray(body.data.organizations)
        ) {
          throw new Error(
            "Failed to extract 'organizations' array from response!",
          );
        }

        const parsed_organizations = await organizationDefinitionSchema
          .array()
          .safeParseAsync(body.data.organizations);

        if (!parsed_organizations.success) {
          console.error(
            `Failed to parse 'organizations' from response object: `,
            parsed_organizations.error,
          );
          throw new Error(
            "Failed to parse 'organizations' from response object!",
          );
        }

        return parsed_organizations.data;
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

export default useAllOrganizationsList;
