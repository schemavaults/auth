"use client";

import { useSWRConfig } from "swr";
import {
  OrganizationMembersCard,
  ApiServersCard,
  AppsCard,
  SentInvitationsCard,
  clearSentInvitationsCache,
  type OrganizationMemberTableData,
  type PreloadedAppsTableDataWithDomainRefs,
  type PreloadedApiServersTableData,
} from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import type { InviteMemberSubmitData, OrganizationDefinition } from "@schemavaults/auth-common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, useToast } from "@schemavaults/ui";
import uuidSync from "@/lib/uuid/uuidSync";

export interface OrgPageViewProps {
  organization: OrganizationDefinition;
  preloaded_members: readonly OrganizationMemberTableData[];
  preloaded_apps: PreloadedAppsTableDataWithDomainRefs;
  preloaded_api_servers: PreloadedApiServersTableData;
  isOrgOwner: boolean;
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
  isOrgOwner,
}: OrgPageViewProps): ReactElement {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  return (
    <PageContainer>
      <OrgTitleCard organization={organization} />

      <OrganizationMembersCard
        organization_id={organization.organization_id}
        cardClassName={"w-full"}
        preloaded={preloaded_members}
        inviteMember={async (data: InviteMemberSubmitData) => {
          try {
            const response = await fetch(
              `/api/organizations/${organization.organization_id}/invitations`,
              {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  input_mode: data.input_mode,
                  identifier: data.input_mode === "email" ? data.email : data.uid,
                }),
              }
            );

            const body = await response.json();

            if (!response.ok || !body.success) {
              throw new Error(body.message || "Failed to send invitation");
            }

            toast({
              title: "Invitation sent!",
              description: `An invitation has been sent to the user.`,
            });

            clearSentInvitationsCache(mutate, organization.organization_id);
          } catch (error: unknown) {
            toast({
              variant: "destructive",
              title: "Failed to send invitation",
              description:
                error instanceof Error ? error.message : "An unknown error occurred",
            });
          }
        }}
      />

      <SentInvitationsCard
        organization_id={organization.organization_id}
        cardClassName="w-full"
      />

      <AppsCard
        queryType="org"
        organization_id={organization.organization_id}
        cardTitle="Organization Client Applications"
        cardDescription="Applications owned by this organization."
        cardClassName="w-full"
        preloaded={preloaded_apps}
        uuid={uuidSync}
      />

      <ApiServersCard
        queryType="org"
        organization_id={organization.organization_id}
        cardTitle="Organization API Servers"
        cardDescription="API servers owned by this organization."
        cardClassName="w-full"
        preloaded={preloaded_api_servers}
        uuid={uuidSync}
        showConnectAppToApi={isOrgOwner}
      />


    </PageContainer>
  );
}
