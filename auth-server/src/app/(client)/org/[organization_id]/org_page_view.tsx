"use client";

import { OrganizationMembersCard, type OrganizationMemberTableData } from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import type { OrganizationDefinition } from "@schemavaults/auth-common";

export interface OrgPageViewProps {
  organization: OrganizationDefinition;
  preloaded_members: readonly OrganizationMemberTableData[];
}

export default function OrgPageView({
  organization,
  preloaded_members,
}: OrgPageViewProps): ReactElement {
  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{organization.name}</h1>
        <p className="text-muted-foreground text-sm">
          Organization ID: {organization.organization_id}
        </p>
      </div>
      <OrganizationMembersCard
        organization_id={organization.organization_id}
        cardClassName={"w-full"}
        preloaded={preloaded_members}
      />
    </PageContainer>
  );
}
