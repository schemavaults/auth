"use client";

import {
  MyOrganizationsCard,
  MyOrganizationsStatsRow,
  PendingInvitationsCard,
} from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import type {
  OrganizationMembershipRoleDetails,
  UserPendingInvitation,
} from "@schemavaults/auth-common";

export interface OrgsPageViewProps {
  /**
   * SSR-preloaded memberships for the current user; the card and stats
   * fetch from GET /api/me/organizations client-side when absent.
   */
  preloaded_memberships?: readonly OrganizationMembershipRoleDetails[];
  /**
   * SSR-preloaded pending invitations for the current user; the card and
   * stats fetch from GET /api/me/invitations client-side when absent.
   */
  preloaded_invitations?: readonly UserPendingInvitation[];
  /**
   * Whether the current user may create new organizations (false when the
   * `admin_only_organization_creation` server setting is enabled and the
   * user is not an admin). Hides the "Create organization" button when false.
   */
  can_create_organization?: boolean;
}

/**
 * The non-admin counterpart of `/admin/organizations`: lists the
 * organizations the current user belongs to and their pending invitations.
 */
export default function OrgsPageView({
  preloaded_memberships,
  preloaded_invitations,
  can_create_organization,
}: OrgsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <div className="flex w-full flex-col gap-4">
        <MyOrganizationsStatsRow
          preloaded={preloaded_memberships}
          preloaded_invitations={preloaded_invitations}
        />
        <MyOrganizationsCard
          cardClassName="w-full"
          preloaded={preloaded_memberships}
          canCreateOrganization={can_create_organization}
        />
        <PendingInvitationsCard
          cardClassName="w-full"
          preloaded={preloaded_invitations}
        />
      </div>
    </PageContainer>
  );
}
