"use client";

import {
  OrganizationMembersCard,
  ApiServersCard,
  AppsCard,
  type OrganizationMemberTableData,
  type PreloadedAppsTableDataWithDomainRefs,
  type PreloadedApiServersTableData,
} from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import type { InviteMemberSubmitData, OrganizationDefinition } from "@schemavaults/auth-common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, useToast } from "@schemavaults/ui";

export interface OrgPageViewProps {
  organization: OrganizationDefinition;
  preloaded_members: readonly OrganizationMemberTableData[];
  preloaded_apps: PreloadedAppsTableDataWithDomainRefs;
  preloaded_api_servers: PreloadedApiServersTableData;
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
  preloaded_apps,
  preloaded_api_servers,
}: OrgPageViewProps): ReactElement {
  const { toast } = useToast();

  return (
    <PageContainer>
      <OrgTitleCard organization={organization} />

      <OrganizationMembersCard
        organization_id={organization.organization_id}
        cardClassName={"w-full"}
        preloaded={preloaded_members}
        inviteMember={async (data: InviteMemberSubmitData) => {
          console.log(data);
          toast({
            title: "Submitted invite member form successfully!",
            description: "...but this functionality is currently unimplemented."
          });
          return;
        }}
      />

      <AppsCard
        queryType="org"
        organization_id={organization.organization_id}
        cardTitle="Organization Client Applications"
        cardDescription="Applications owned by this organization."
        cardClassName="w-full"
        preloaded={preloaded_apps}
      />

      <ApiServersCard
        queryType="org"
        organization_id={organization.organization_id}
        cardTitle="Organization API Servers"
        cardDescription="API servers owned by this organization."
        cardClassName="w-full"
        preloaded={preloaded_api_servers}
      />


    </PageContainer>
  );
}
