"use client";

import type { ReactElement } from "react";
import {
  StatCard,
  StatCardHeader,
  StatCardLabel,
  StatCardValue,
  StatCardDescription,
  StatCardIcon,
} from "@schemavaults/ui";
import type { OrganizationMembershipRoleDetails } from "@schemavaults/auth-common";
import { useMyOrganizations } from "@schemavaults/auth-react-provider";
import { UserRoundCheck } from "lucide-react";

export interface MyOrganizationsStatCardProps {
  /**
   * SSR-preloaded memberships for the current user, used as SWR
   * `fallbackData` so the count renders on first paint.
   */
  preloaded?: readonly OrganizationMembershipRoleDetails[];
  label?: string;
  description?: string;
  className?: string;
}

/**
 * A single stat card showing how many organizations the *current user* is
 * a member of. Shared by `MyOrganizationsStatsRow` (the `/orgs` page) and
 * `OrganizationsStatsRow` (the `/admin/organizations` page).
 */
export function MyOrganizationsStatCard(
  props: MyOrganizationsStatCardProps,
): ReactElement {
  const memberships = useMyOrganizations({ initialData: props.preloaded });

  const total: number = memberships.data?.length ?? 0;
  const loading: boolean = !memberships.data;

  return (
    <StatCard
      className={props.className}
      data-testid="my-organizations-stat-card"
    >
      <StatCardHeader>
        <StatCardLabel>{props.label ?? "Your organizations"}</StatCardLabel>
        <StatCardIcon>
          <UserRoundCheck />
        </StatCardIcon>
      </StatCardHeader>
      <StatCardValue
        loading={loading}
        data-testid="my-organizations-stat-value"
      >
        {total}
      </StatCardValue>
      <StatCardDescription>
        {props.description ?? "Organizations you are a member of."}
      </StatCardDescription>
    </StatCard>
  );
}

export default MyOrganizationsStatCard;
