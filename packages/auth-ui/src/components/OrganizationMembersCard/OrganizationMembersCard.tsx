"use client";

import { useState, type ReactElement } from "react";
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
import type { InviteMemberSubmitData } from "@schemavaults/auth-common";
import InviteMemberDialog, {
  InviteMemberDialogDispatchContext,
} from "@/components/InviteMemberDialog";

export interface OrganizationMembersCardProps {
  organization_id: string;
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly OrganizationMemberTableData[];
  inviteMember?: (
    inviteMemberFormSubmissionData: InviteMemberSubmitData,
  ) => Promise<void>;
}

export function OrganizationMembersCard(
  props: OrganizationMembersCardProps,
): ReactElement {
  const cardTitle = props.cardTitle ?? "Organization Members";
  const cardDescription = props.cardDescription ?? "View organization members.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  const [inviteMemberDialogOpen, setInviteMemberDialogOpen] =
    useState<boolean>(false);

  const canInvite = !!props.inviteMember;

  return (
    <InviteMemberDialogDispatchContext.Provider
      value={setInviteMemberDialogOpen}
    >
      <Card className={cardClassName}>
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
          <CardDescription>{cardDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationMembersTable
            organization_id={props.organization_id}
            preloaded_members={props.preloaded}
            showInviteButton={canInvite}
          />
        </CardContent>
        {/*<CardFooter>
        <div className="flex flex-row items-start justify-start gap-2"></div>
      </CardFooter>*/}
      </Card>
      {canInvite && (
        <InviteMemberDialog
          open={inviteMemberDialogOpen}
          onOpenChange={setInviteMemberDialogOpen}
          organization_id={props.organization_id}
          onSubmit={props.inviteMember!}
        />
      )}
    </InviteMemberDialogDispatchContext.Provider>
  );
}

export default OrganizationMembersCard;
