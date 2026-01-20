"use client";

import { OrganizationMembersCard, type OrganizationMemberTableData } from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@schemavaults/ui";

export interface OrgPageViewProps {
  organization: OrganizationDefinition;
  preloaded_members: readonly OrganizationMemberTableData[];
}

function OrgTitleCard({ organization }: Pick<OrgPageViewProps, 'organization'>): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ organization.name }</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>
          Organization ID: <span className="font-bold">{organization.organization_id}</span>
        </CardDescription>
      </CardContent>
    </Card>
  )
}

export default function OrgPageView({
  organization,
  preloaded_members,
}: OrgPageViewProps): ReactElement {
  return (
    <PageContainer>
      <OrgTitleCard organization={organization} />

      <OrganizationMembersCard
        organization_id={organization.organization_id}
        cardClassName={"w-full"}
        preloaded={preloaded_members}
      />
    </PageContainer>
  );
}
