import "server-only";

import OrgPageView from "./org_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  OrganizationsRegistry,
  type OrganizationMemberWithUserData,
} from "@/lib/auth-db/organizations";
import type { ServerRuntime } from "next";
import {
  type OrganizationDefinition,
  type OrganizationID,
  organizationIdSchema,
} from "@schemavaults/auth-common";
import { redirect } from "next/navigation";
import type { OrganizationMemberTableData } from "@schemavaults/auth-ui";

interface PageParams {
  params: Promise<{ organization_id: string }>;
}

function memberToTableData(
  member: OrganizationMemberWithUserData,
): OrganizationMemberTableData {
  return {
    membership_declaration_id: member.membership_declaration_id,
    organization_id: member.organization_id,
    uid: member.uid,
    role: member.role,
    membership_created_at: member.membership_created_at,
    email: member.email,
    email_verified: member.email_verified,
    admin: member.admin,
    disabled: member.disabled,
  };
}

async function PreloadedOrgPage(
  { user, dbh }: IProtectedAuthenticatedServerComponentPageProps,
  pageParams: PageParams,
): Promise<ReactElement> {
  const { organization_id: org_id_param } = await pageParams.params;

  const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id_param);
  if (!parsed_org_id.success) {
    redirect("/account?error=invalid_organization_id");
  }
  const organization_id: OrganizationID = parsed_org_id.data;

  const registry = new OrganizationsRegistry(dbh.db);

  // Check access: user must be admin OR member of the organization
  if (!user.admin) {
    const userMemberships = await registry.listUserOrganizationMemberships(
      user.uid,
    );
    const isMember = userMemberships.includes(organization_id);
    if (!isMember) {
      redirect("/account?error=forbidden");
    }
  }

  let organization: OrganizationDefinition;
  try {
    organization = await registry.lookupOrganization(organization_id);
  } catch (e: unknown) {
    console.error(`Failed to lookup organization '${organization_id}': `, e);
    redirect("/account?error=organization_not_found");
  }

  const members: readonly OrganizationMemberWithUserData[] =
    await registry.listOrganizationMembers(organization_id);
  const preloaded_members: readonly OrganizationMemberTableData[] =
    members.map(memberToTableData);

  return (
    <OrgPageView
      organization={organization}
      preloaded_members={preloaded_members}
    />
  );
}

export default async function ViewOrganizationPage(
  pageParams: PageParams,
): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard((props) =>
    PreloadedOrgPage(props, pageParams),
  );
}

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";
