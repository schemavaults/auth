"use client";

import type { ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import {
  type ISchemaVaultsAuthClient,
  useAuth,
} from "@schemavaults/auth-react-provider";
import OrganizationsTable from "@/components/OrganizationsTable";
import {
  organizationDefinitionSchema,
  type OrganizationDefinition,
} from "@schemavaults/auth-common";
import useSWR, { type useSWRConfig } from "swr";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";
import { CreateOrganizationDialog } from "@/components/CreateOrganizationDialog";

export interface OrganizationsCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly OrganizationDefinition[];
}

const listAllOrganizationsEndpoint = "/api/admin/organizations";

function clearOrganizationsCache(
  mutate: ReturnType<typeof useSWRConfig>["mutate"],
): void {
  mutate(listAllOrganizationsEndpoint);
}

export function OrganizationsCard(props: OrganizationsCardProps): ReactElement {
  const authClient = useAuth();

  const cardTitle = props.cardTitle ?? "Organizations";
  const cardDescription =
    props.cardDescription ?? "View and manage organizations.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  const organizations = useSWR(
    listAllOrganizationsEndpoint,
    async (): Promise<readonly OrganizationDefinition[]> => {
      if (!authClient.ready || !authClient.client.current) {
        throw new Error("Auth client is not ready to list data!");
      }
      const auth: ISchemaVaultsAuthClient = authClient.client.current;

      let jwt: string;
      try {
        const accessToken = await auth.acquireAccessToken({
          audience: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
          token_id: SCHEMAVAULTS_AUTH_APP_DEFINITION.app_id,
        });
        jwt = accessToken.token;
      } catch (e: unknown) {
        console.error(
          "Failed to acquire access token in order to list organizations: ",
          e,
        );
        throw new Error(
          "Failed to acquire access token in order to list organizations!",
        );
      }

      try {
        const response = await fetch(listAllOrganizationsEndpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
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

        const organizations: readonly OrganizationDefinition[] =
          parsed_organizations.data;
        return organizations;
      } catch (e: unknown) {
        console.error(`Failed to list organizations: `, e);
        throw new Error(`Failed to list organizations!`);
      }
    },
    {
      fallbackData: props.preloaded,
    },
  );

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <OrganizationsTable organizations={organizations} />
      </CardContent>
      <CardFooter>
        <div className="flex flex-row items-start justify-start gap-2">
          <CreateOrganizationDialog
            clearOrganizationsCache={clearOrganizationsCache}
          />
        </div>
      </CardFooter>
    </Card>
  );
}
