"use client";

import { OrganizationMembersCard, ApiServersCard, AppsCard, type OrganizationMemberTableData } from "@schemavaults/auth-ui";
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

      <AppsCard
        queryType="org"
        organization_id={organization.organization_id}
        cardTitle="Organization Client Applications"
        cardDescription="Applications owned by this organization."
        cardClassName="w-full"
      />

      <ApiServersCard
        queryType="org"
        organization_id={organization.organization_id}
        cardTitle="Organization API Servers"
        cardDescription="API servers owned by this organization."
        cardClassName="w-full"
      />


    </PageContainer>
  );
}
