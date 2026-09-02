"use client";

import {
  OrganizationsCard,
  OrganizationsStatsRow,
} from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import type {
  OrganizationDefinition,
  OrganizationMembershipRoleDetails,
} from "@schemavaults/auth-common";

export interface AdminOrganizationsPageViewProps {
  preloaded: readonly OrganizationDefinition[];
  /**
   * SSR-preloaded memberships of the *current* admin user, backing the
   * "Your organizations" stat card.
   */
  preloaded_my_memberships?: readonly OrganizationMembershipRoleDetails[];
}

export default function AdminOrganizationsPageView({
  preloaded,
  preloaded_my_memberships,
}: AdminOrganizationsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <div className="flex w-full flex-col gap-4">
        <OrganizationsStatsRow
          preloaded={preloaded}
          preloaded_my_memberships={preloaded_my_memberships}
        />
        <OrganizationsCard cardClassName={"w-full"} preloaded={preloaded} />
      </div>
    </PageContainer>
  );
}
