"use client";

import { useSWRConfig } from "swr";
import {
  OrganizationMembersCard,
  ApiServersCard,
  AppsCard,
  SentInvitationsCard,
  clearSentInvitationsCache,
  OrganizationSettingsCard,
  type OrganizationMemberTableData,
  type PreloadedAppsTableDataWithDomainRefs,
  type PreloadedApiServersTableDataWithDomainRefs,
} from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import { useRouter } from "next/navigation";
import PageContainer from "@/components/PageContainer";
import type { InviteMemberSubmitData, OrganizationDefinition, OrganizationMembershipRoleType } from "@schemavaults/auth-common";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, useToast } from "@schemavaults/ui";
import uuidSync from "@/lib/uuid/uuidSync";

export interface OrgPageViewProps {
  organization: OrganizationDefinition;
  preloaded_members: readonly OrganizationMemberTableData[];
  preloaded_apps: PreloadedAppsTableDataWithDomainRefs;
  preloaded_api_servers: PreloadedApiServersTableDataWithDomainRefs;
  isOrgOwner: boolean;
  userRole?: OrganizationMembershipRoleType;
}

function OrgTitleCard({ organization, userRole }: Pick<OrgPageViewProps, 'organization' | 'userRole'>): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{ organization.name }</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="flex flex-col gap-1">
          <span>Organization ID: <span className="font-bold">{organization.organization_id}</span></span>
          {userRole && (
            <span>Your Role: <span className="font-bold capitalize">{userRole}</span></span>
          )}
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
  userRole,
}: OrgPageViewProps): ReactElement {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const router = useRouter();

  return (
    <PageContainer>
      <OrgTitleCard organization={organization} userRole={userRole} />

      <OrganizationMembersCard
        organization_id={organization.organization_id}
        cardClassName={"w-full"}
        preloaded={preloaded_members}
        inviteMember={isOrgOwner ? async (data: InviteMemberSubmitData) => {
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
        } : undefined}
      />

      {isOrgOwner && (
        <SentInvitationsCard
          organization_id={organization.organization_id}
          cardClassName="w-full"
        />
      )}

      <AppsCard
        queryType="org"
        organization_id={organization.organization_id}
        cardTitle="Organization Client Applications"
        cardDescription="Applications owned by this organization."
        cardClassName="w-full"
        preloaded={preloaded_apps}
        uuid={uuidSync}
        isOrgOwner={isOrgOwner}
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
        isOrgOwner={isOrgOwner}
      />

      {isOrgOwner && (
        <OrganizationSettingsCard
          organization_id={organization.organization_id}
          organization_name={organization.name}
          redirect={async (url: string) => router.push(url)}
        />
      )}
    </PageContainer>
  );
}
