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
import type {
  AssignMemberSubmitData,
  InviteMemberSubmitData,
} from "@schemavaults/auth-common";
import InviteMemberDialog, {
  InviteMemberDialogDispatchContext,
} from "@/components/InviteMemberDialog";
import AssignOrganizationMemberDialog, {
  AssignOrganizationMemberDialogDispatchContext,
  type AssignOrganizationMemberDialogUser,
} from "@/components/AssignOrganizationMemberDialog";

export interface OrganizationMembersCardProps {
  organization_id: string;
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly OrganizationMemberTableData[];
  inviteMember?: (
    inviteMemberFormSubmissionData: InviteMemberSubmitData,
  ) => Promise<void>;
  /**
   * Adds a member directly, without an invitation. Pass it for platform
   * administrators only (`POST /api/organizations/{organization_id}/members`
   * refuses everyone else): it shows the "Add Member" button.
   */
  assignMember?: (
    assignMemberFormSubmissionData: AssignMemberSubmitData,
  ) => Promise<void>;
  /** Display name of the organization, used in the add member dialog. */
  organization_name?: string;
  /** The signed-in administrator, offered as "Myself" by the add member dialog. */
  currentUser?: AssignOrganizationMemberDialogUser;
}

export function OrganizationMembersCard(
  props: OrganizationMembersCardProps,
): ReactElement {
  const cardTitle = props.cardTitle ?? "Organization Members";
  const cardDescription = props.cardDescription ?? "View organization members.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  const [inviteMemberDialogOpen, setInviteMemberDialogOpen] =
    useState<boolean>(false);
  const [assignMemberDialogOpen, setAssignMemberDialogOpen] =
    useState<boolean>(false);

  const canInvite = !!props.inviteMember;
  const canAssign = !!props.assignMember;

  return (
    <InviteMemberDialogDispatchContext.Provider
      value={setInviteMemberDialogOpen}
    >
      <AssignOrganizationMemberDialogDispatchContext.Provider
        value={setAssignMemberDialogOpen}
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
              showAssignButton={canAssign}
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
        {canAssign && (
          <AssignOrganizationMemberDialog
            open={assignMemberDialogOpen}
            onOpenChange={setAssignMemberDialogOpen}
            organization_id={props.organization_id}
            organization_name={props.organization_name}
            currentUser={props.currentUser}
            onSubmit={props.assignMember!}
          />
        )}
      </AssignOrganizationMemberDialogDispatchContext.Provider>
    </InviteMemberDialogDispatchContext.Provider>
  );
}

export default OrganizationMembersCard;
