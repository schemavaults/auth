"use client";

import type { ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import {
  type ISchemaVaultsAuthClient,
  useAuth,
} from "@schemavaults/auth-react-provider";
import OrganizationMembersTable, {
  type OrganizationMemberTableData,
} from "@/components/OrganizationMembersTable";
import useSWR from "swr";
import { SCHEMAVAULTS_AUTH_APP_DEFINITION } from "@schemavaults/app-definitions";

export interface OrganizationMembersCardProps {
  organization_id: string;
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly OrganizationMemberTableData[];
}

export function OrganizationMembersCard(
  props: OrganizationMembersCardProps,
): ReactElement {
  const authClient = useAuth();

  const cardTitle = props.cardTitle ?? "Organization Members";
  const cardDescription = props.cardDescription ?? "View organization members.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  const listOrganizationMembersEndpoint = `/api/organizations/${props.organization_id}/members`;

  const members = useSWR(
    listOrganizationMembersEndpoint,
    async (): Promise<readonly OrganizationMemberTableData[]> => {
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
          "Failed to acquire access token in order to list organization members: ",
          e,
        );
        throw new Error(
          "Failed to acquire access token in order to list organization members!",
        );
      }

      try {
        const response = await fetch(listOrganizationMembersEndpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${jwt}`,
          },
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
        <OrganizationMembersTable members={members} />
      </CardContent>
      {/*<CardFooter>
        <div className="flex flex-row items-start justify-start gap-2"></div>
      </CardFooter>*/}
    </Card>
  );
}

export default OrganizationMembersCard;
