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
import OrganizationMembersTable, {
  type OrganizationMemberTableData,
} from "@/components/OrganizationMembersTable";
import useSWR from "swr";
import type { InviteMemberSubmitData } from "@schemavaults/auth-common";

export interface OrganizationMembersCardProps {
  organization_id: string;
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly OrganizationMemberTableData[];
  inviteMember: (
    inviteMemberFormSubmissionData: InviteMemberSubmitData,
  ) => Promise<void>;
}

export function OrganizationMembersCard(
  props: OrganizationMembersCardProps,
): ReactElement {
  const cardTitle = props.cardTitle ?? "Organization Members";
  const cardDescription = props.cardDescription ?? "View organization members.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  const listOrganizationMembersEndpoint = `/api/organizations/${props.organization_id}/members`;

  const members = useSWR(
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
        <OrganizationMembersTable
          organization_id={props.organization_id}
          members={members}
          inviteMember={props.inviteMember}
        />
      </CardContent>
      {/*<CardFooter>
        <div className="flex flex-row items-start justify-start gap-2"></div>
      </CardFooter>*/}
    </Card>
  );
}

export default OrganizationMembersCard;
