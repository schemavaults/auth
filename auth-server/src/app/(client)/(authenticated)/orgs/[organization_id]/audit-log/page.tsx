import "server-only";
import type { ReactElement } from "react";

import OrganizationAuditLogPageView from "./organization-audit-log-page-view";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { OrganizationsRegistry } from "@/lib/auth-db/organizations";
import {
  type OrganizationDefinition,
  type OrganizationID,
  organizationIdSchema,
} from "@schemavaults/auth-common/organizations";
import type { AuditLogPage } from "@/lib/audit-log/audit-log-entry-schema";
import loadFirstAuditLogPage from "@/lib/audit-log/load-audit-log-page";
import redirectWithError from "@/lib/redirect-with-error";
import reportServerException from "@/lib/reportServerException";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

async function OrganizationAuditLogPageServerComponent(
  { user, dbh }: IProtectedAuthenticatedServerComponentPageProps,
  pageParams: PageProps<"/orgs/[organization_id]/audit-log">,
): Promise<ReactElement> {
  const { organization_id: org_id_param } = await pageParams.params;
  const parsed_org_id = await organizationIdSchema.safeParseAsync(org_id_param);
  if (!parsed_org_id.success) {
    redirectWithError(400, "bad_request");
  }
  const organization_id: OrganizationID = parsed_org_id.data;

  const registry = new OrganizationsRegistry(dbh.db);

  // The same rule as GET /api/organizations/{organization_id}/audit-log:
  // organization owners and platform administrators.
  if (!user.admin) {
    const memberships = await registry.listUserOrganizationMemberships(user.uid, false);
    const membership = memberships.find((m) => m.organization_id === organization_id);
    if (!membership || membership.role !== "owner") {
      redirectWithError(403, "forbidden");
    }
  }

  let organization: OrganizationDefinition;
  try {
    organization = await registry.lookupOrganization(organization_id);
  } catch (e: unknown) {
    console.error(`Failed to lookup organization '${organization_id}': `, e);
    redirect("/orgs?error=organization_not_found");
  }

  // On preload failure the card loads the endpoint client-side.
  let preloaded: AuditLogPage | undefined;
  try {
    preloaded = await loadFirstAuditLogPage(dbh.db, { organization_id });
  } catch (e: unknown) {
    console.error("Failed to preload the organization audit log:", e);
    await reportServerException(e, {
      op_name: "OrganizationAuditLogPage.preloadAuditLog",
      route: "/orgs/[organization_id]/audit-log",
      uid: user.uid,
      context: { organization_id, nonFatal: true },
    });
  }

  return (
    <OrganizationAuditLogPageView
      organization_id={organization.organization_id}
      organization_name={organization.name}
      viewer_uid={user.uid}
      preloaded={preloaded}
    />
  );
}

export default async function OrganizationAuditLogPage(
  pageParams: PageProps<"/orgs/[organization_id]/audit-log">,
): Promise<ReactElement> {
  await connection();
  const { organization_id } = await pageParams.params;
  // Only forward a next_href when the organization_id is well-formed.
  const parsed_organization_id = organizationIdSchema.safeParse(organization_id);
  return await withAuthenticatedServerComponentRouteGuard(
    (props) => OrganizationAuditLogPageServerComponent(props, pageParams),
    parsed_organization_id.success
      ? { next_href: `/orgs/${parsed_organization_id.data}/audit-log` }
      : undefined,
  );
}

export const runtime: ServerRuntime = "nodejs";
