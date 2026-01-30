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
import SentInvitationsTable from "@/components/SentInvitationsTable";
import type { OrganizationInvitationWithUserData, OrganizationID } from "@schemavaults/auth-common";

export interface SentInvitationsCardProps {
  organization_id: OrganizationID;
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly OrganizationInvitationWithUserData[];
}

export function SentInvitationsCard(
  props: SentInvitationsCardProps
): ReactElement {
  const cardTitle = props.cardTitle ?? "Sent Invitations";
  const cardDescription =
    props.cardDescription ??
    "Invitations sent to users to join this organization.";
  const cardClassName: string = cn("w-full", props.cardClassName);

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <SentInvitationsTable
          organization_id={props.organization_id}
          preloaded={props.preloaded}
        />
      </CardContent>
    </Card>
  );
}

export default SentInvitationsCard;
