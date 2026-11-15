"use client";

import { useSWRConfig } from "swr";
import {
  OrganizationMembersCard,
  getOrganizationMembersEndpoint,
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
import type {
  AssignMemberSubmitData,
  InviteMemberSubmitData,
  OrganizationDefinition,
  OrganizationMembershipRoleType,
} from "@schemavaults/auth-common";
import { Button, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, useToast } from "@schemavaults/ui";
import { ScrollText } from "lucide-react";
import Link from "next/link";
import uuidSync from "@/lib/uuid/uuidSync";
import { OrganizationMfaRequirementCard } from "@/components/OrganizationMfaRequirement";
import type { OrganizationMfaRequirementView } from "@/lib/organization-mfa-requirements/types";

export interface OrgPageViewProps {
  organization: OrganizationDefinition;
  preloaded_members: readonly OrganizationMemberTableData[];
  preloaded_apps: PreloadedAppsTableDataWithDomainRefs;
  preloaded_api_servers: PreloadedApiServersTableDataWithDomainRefs;
  isOrgOwner: boolean;
  userRole?: OrganizationMembershipRoleType;
  /**
   * Whether the create app / API server dialogs also offer the "Personal"
   * owner (the `allow_user_owned_resource_creation` server setting; always
   * true for admins). They preselect this organization either way.
   */
  can_create_personal_resources: boolean;
  /**
   * Set when the viewer is a platform administrator: they may add members
   * directly (no invitation), themselves included.
   */
  platform_admin?: { uid: string; email: string };
  /**
   * The organization's MFA requirement (null for system organizations, or
   * when it failed to load: the card is then left out).
   */
  preloaded_mfa_requirement: OrganizationMfaRequirementView | null;
  /** Whether the viewer holds a membership of the organization. */
  viewerIsMember: boolean;
  /**
   * Whether the viewer may read the organization's audit log (owners and
   * platform administrators): shows the link to it.
   */
  canViewAuditLog: boolean;
}

function OrgAuditLogLinkCard({ organization }: Pick<OrgPageViewProps, 'organization'>): ReactElement {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-muted-foreground" />
          Audit log
        </CardTitle>
        <CardDescription>
          Who invited, added or removed members, changed roles, or changed this
          organization&apos;s MFA requirement, and when.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild className="flex flex-row gap-2 flex-nowrap">
          <Link
            href={`/orgs/${organization.organization_id}/audit-log`}
            data-testid="view-organization-audit-log-link"
          >
            <ScrollText className="h-4 w-4" />
            View audit log
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
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
  can_create_personal_resources,
  platform_admin,
  preloaded_mfa_requirement,
  viewerIsMember,
  canViewAuditLog,
}: OrgPageViewProps): ReactElement {
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const router = useRouter();

  // Platform administrators add members directly; errors are thrown so the
  // dialog stays open and shows them.
  async function assignMember(data: AssignMemberSubmitData): Promise<void> {
    const response = await fetch(
      `/api/organizations/${organization.organization_id}/members`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input_mode: data.input_mode,
          identifier: data.identifier,
          role: data.role,
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) {
      throw new Error(
        body.message ?? `Failed to add member (response status: ${response.status})`,
      );
    }

    toast({
      title: "Member added!",
      description: body.message ?? "The user is now a member of this organization.",
    });

    await mutate(getOrganizationMembersEndpoint(organization.organization_id));
    // Superseded pending invitations were revoked
    clearSentInvitationsCache(mutate, organization.organization_id);
    // The viewer's own role may have changed (adding themselves)
    if (platform_admin && body.data?.member?.uid === platform_admin.uid) {
      router.refresh();
    }
  }

  return (
    <PageContainer>
      <OrgTitleCard organization={organization} userRole={userRole} />

      <OrganizationMembersCard
        organization_id={organization.organization_id}
        cardClassName={"w-full"}
        preloaded={preloaded_members}
        organization_name={organization.name}
        currentUser={platform_admin}
        assignMember={platform_admin ? assignMember : undefined}
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
        organization_name={organization.name}
        canCreatePersonal={can_create_personal_resources}
        cardTitle="Organization Client Applications"
        cardDescription="Applications owned by this organization."
        cardClassName="w-full"
        preloaded={preloaded_apps}
        uuid={uuidSync}
        showConnectAppToApi={isOrgOwner}
        isOrgOwner={isOrgOwner}
      />

      <ApiServersCard
        queryType="org"
        organization_id={organization.organization_id}
        organization_name={organization.name}
        canCreatePersonal={can_create_personal_resources}
        cardTitle="Organization API Servers"
        cardDescription="API servers owned by this organization."
        cardClassName="w-full"
        preloaded={preloaded_api_servers}
        uuid={uuidSync}
        showConnectAppToApi={isOrgOwner}
        isOrgOwner={isOrgOwner}
      />

      {preloaded_mfa_requirement && (
        <OrganizationMfaRequirementCard
          organization_id={organization.organization_id}
          organization_name={organization.name}
          preloaded={preloaded_mfa_requirement}
          canManage={isOrgOwner}
          viewerIsMember={viewerIsMember}
        />
      )}

      {canViewAuditLog && <OrgAuditLogLinkCard organization={organization} />}

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
