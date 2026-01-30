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
import PendingInvitationsTable from "@/components/PendingInvitationsTable";
import type { UserPendingInvitation } from "@schemavaults/auth-common";

export interface PendingInvitationsCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly UserPendingInvitation[];
}

export function PendingInvitationsCard(
  props: PendingInvitationsCardProps
): ReactElement {
  const cardTitle = props.cardTitle ?? "Pending Invitations";
  const cardDescription =
    props.cardDescription ??
    "Organizations you've been invited to join.";
  const cardClassName: string = cn("w-full", props.cardClassName);

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <PendingInvitationsTable preloaded={props.preloaded} />
      </CardContent>
    </Card>
  );
}

export default PendingInvitationsCard;
