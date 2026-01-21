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
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  SchemaVaultsAppRegistry,
  AuthorizedAppsRegistry,
  preloadAppsTable,
} from "@/lib/auth-db/apps";
import {
  SchemaVaultsApiServerRegistry,
  preloadApiServersTable,
} from "@/lib/auth-db/apis";

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
  { user, dbh }: IProtectedAuthenticatedServerComponentPageProps<AuthDatabase>,
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
      user.admin
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

  // Create registries for apps and API servers
  const appsRegistry = new SchemaVaultsAppRegistry(dbh.db);
  const authorizedAppsRegistry = new AuthorizedAppsRegistry(dbh.db);
  const apiServerRegistry = new SchemaVaultsApiServerRegistry(dbh.db);

  // Fetch members, apps, and API servers in parallel
  const [members, preloaded_apps, preloaded_api_servers] = await Promise.all([
    registry.listOrganizationMembers(organization_id),
    preloadAppsTable({
      list_apps_query_type: "org",
      user,
      appsRegistry,
      authorizedAppsRegistry,
      organization_id,
    }),
    preloadApiServersTable({
      list_api_servers_query_type: "org",
      user,
      apiServerRegistry,
      organization_id,
    }),
  ]);

  const preloaded_members: readonly OrganizationMemberTableData[] =
    members.map(memberToTableData);

  return (
    <OrgPageView
      organization={organization}
      preloaded_members={preloaded_members}
      preloaded_apps={preloaded_apps}
      preloaded_api_servers={preloaded_api_servers}
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
