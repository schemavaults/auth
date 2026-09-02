"use client";

import { useMemo, type ReactElement } from "react";
import {
  StatCard,
  StatCardHeader,
  StatCardLabel,
  StatCardValue,
  StatCardDescription,
  StatCardIcon,
  cn,
  useToast,
} from "@schemavaults/ui";
import type {
  OrganizationMembershipRoleDetails,
  UserPendingInvitation,
} from "@schemavaults/auth-common";
import { useMyOrganizations } from "@schemavaults/auth-react-provider";
import { Crown, MailOpen } from "lucide-react";
import { usePendingInvitations } from "@/components/PendingInvitationsTable";
import MyOrganizationsStatCard from "./MyOrganizationsStatCard";

export interface MyOrganizationsStatsRowProps {
  /**
   * SSR-preloaded memberships for the current user.
   */
  preloaded?: readonly OrganizationMembershipRoleDetails[];
  /**
   * SSR-preloaded pending organization invitations for the current user.
   */
  preloaded_invitations?: readonly UserPendingInvitation[];
  className?: string;
}

/**
 * Statistics overview for the current user's organizations: how many they
 * belong to, how many they own, and how many invitations await a response.
 */
export function MyOrganizationsStatsRow(
  props: MyOrganizationsStatsRowProps,
): ReactElement {
  const { toast } = useToast();
  const memberships = useMyOrganizations({ initialData: props.preloaded });
  const invitations = usePendingInvitations({
    toast,
    initialData: props.preloaded_invitations,
  });

  const owned: number = useMemo(
    () =>
      (memberships.data ?? []).filter(
        (membership) => membership.role === "owner",
      ).length,
    [memberships.data],
  );
  const pending: number = invitations.data?.length ?? 0;

  const membershipsLoading: boolean = !memberships.data;
  const invitationsLoading: boolean = !invitations.data;

  return (
    <div
      className={cn(
        "grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
        props.className,
      )}
      data-testid="my-organizations-stats-row"
    >
      <MyOrganizationsStatCard preloaded={props.preloaded} />

      <StatCard>
        <StatCardHeader>
          <StatCardLabel>Organizations you own</StatCardLabel>
          <StatCardIcon>
            <Crown />
          </StatCardIcon>
        </StatCardHeader>
        <StatCardValue loading={membershipsLoading}>{owned}</StatCardValue>
        <StatCardDescription>
          Organizations where your role is owner.
        </StatCardDescription>
      </StatCard>

      <StatCard variant={pending > 0 ? "default" : undefined}>
        <StatCardHeader>
          <StatCardLabel>Pending invitations</StatCardLabel>
          <StatCardIcon>
            <MailOpen />
          </StatCardIcon>
        </StatCardHeader>
        <StatCardValue
          loading={invitationsLoading}
          data-testid="pending-invitations-stat-value"
        >
          {pending}
        </StatCardValue>
        <StatCardDescription>
          Invitations waiting for your response.
        </StatCardDescription>
      </StatCard>
    </div>
  );
}

export default MyOrganizationsStatsRow;
