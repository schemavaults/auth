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
import type { OrganizationMembershipRoleDetails } from "@schemavaults/auth-common";
import MyOrganizationsTable from "@/components/MyOrganizationsTable";
import CreateOrganizationDialog, {
  CreateOrganizationDialogDispatchContext,
} from "@/components/CreateOrganizationDialog";

export interface MyOrganizationsCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  /**
   * SSR-preloaded memberships for the current user (see
   * `useMyOrganizations()` in `@schemavaults/auth-react-provider`).
   */
  preloaded?: readonly OrganizationMembershipRoleDetails[];
  /**
   * Whether the current user may create new organizations (false when the
   * `admin_only_organization_creation` server setting is enabled and the
   * user is not an admin). Hides the "Create organization" button when false.
   * Defaults to true.
   */
  canCreateOrganization?: boolean;
}

/**
 * Lists the organizations the *current user* is a member of, with their
 * role in each. The non-admin counterpart of `OrganizationsCard` (which
 * lists every organization on the server).
 */
export function MyOrganizationsCard(
  props: MyOrganizationsCardProps,
): ReactElement {
  const cardTitle = props.cardTitle ?? "Your Organizations";
  const cardDescription =
    props.cardDescription ??
    "Organizations you are a member of, and your role in each.";
  const [createOrganizationDialogOpen, setCreateOrganizationDialogOpen] =
    useState<boolean>(false);
  const cardClassName: string = cn("w-full", props.cardClassName);

  return (
    <CreateOrganizationDialogDispatchContext.Provider
      value={setCreateOrganizationDialogOpen}
    >
      <Card className={cardClassName} data-testid="my-organizations-card">
        <CardHeader>
          <CardTitle>{cardTitle}</CardTitle>
          <CardDescription>{cardDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <MyOrganizationsTable
            preloaded={props.preloaded}
            canCreateOrganization={props.canCreateOrganization ?? true}
          />
        </CardContent>
      </Card>
      <CreateOrganizationDialog
        open={createOrganizationDialogOpen}
        onOpenChange={setCreateOrganizationDialogOpen}
      />
    </CreateOrganizationDialogDispatchContext.Provider>
  );
}

export default MyOrganizationsCard;
