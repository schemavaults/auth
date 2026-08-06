import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard,
  type IProtectedAuthenticatedServerComponentPageProps,
} from "@/lib/withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import ApiServerDetailPageView from "./api-server-detail-page-view";
import { type ApiServerId, apiServerIdSchema, type SchemaVaultsApiServerDefinition, type SchemaVaultsApiServerDomainRef, getAppEnvironment } from "@schemavaults/app-definitions";
import { isHardcodedApiServerId } from "@schemavaults/app-definitions";
import redirectWithError from "@/lib/redirect-with-error";
import { loadApiServerDefinitionFromDatabase, SchemaVaultsAppToApiPermissionsRegistry, SchemaVaultsApiServerRegistry } from "@/lib/auth-db/apis";
import { type OrganizationMembershipRoleType, type OrganizationID } from "@schemavaults/auth-common";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import { OrganizationsRegistry } from "@/lib/auth-db";
import isUserInOrganization from "@/lib/isUserInOrganization";
import { connection } from "next/server";
import type { ServerRuntime } from "next/types";

export default async function ApiServerDetailPage(
  pageParams: PageProps<"/apis/[api_server_id]">
): Promise<ReactElement> {
  await connection();
  const { api_server_id: raw_api_server_id } = await pageParams.params;

  return await withAuthenticatedServerComponentRouteGuard(
    async function ApiServerDetailPageServerComponent({
      dbh,
      user,
    }: IProtectedAuthenticatedServerComponentPageProps): Promise<ReactElement> {
      let api_server_id: ApiServerId;
      try {
        const parsed_api_server_id = await apiServerIdSchema.safeParseAsync((await pageParams.params).api_server_id)
        if (!parsed_api_server_id.success) {
          throw parsed_api_server_id.error;
        }
        api_server_id = parsed_api_server_id.data;
      } catch (e: unknown) {
        console.error("[ApiServerDetailPage] There was an attempt to load a page with an invalid 'api_server_id': ", e);
        redirectWithError(400, "bad_request");
      }

      const hardcoded: boolean = isHardcodedApiServerId(api_server_id)
      if (hardcoded && !user.admin) {
        redirectWithError(403, 'forbidden');
      }

      const api_server: SchemaVaultsApiServerDefinition = await loadApiServerDefinitionFromDatabase({ api_server_id, db: dbh.db });
      const owner_organization_id: OrganizationID | null | undefined = api_server['owner_organization_id'];
      if (!owner_organization_id || typeof owner_organization_id !== 'string') {
        console.error(`Failed to resolve 'owner_organization_id' for API server: '${api_server_id}'`);
        redirectWithError(500, "internal_server_error");
      }

      if (owner_organization_id === getAuthServerOwnerOrganizationId() && !user.admin) {
        console.warn("Blocking request to view API server detail page for a platform-owned API server for non-admin user!")
        redirectWithError(403, 'forbidden');
      }


      const role: OrganizationMembershipRoleType | false = await isUserInOrganization(dbh.db, user, owner_organization_id);
      let canView: boolean = false;
      if (user.admin) {
        canView = true;
      } else if (role === 'admin' || role === 'owner' || role === 'member') {
        canView = true;
      }
      if (!canView) {
        redirectWithError(403, 'forbidden');
      }

      const permissions_registry = new SchemaVaultsAppToApiPermissionsRegistry(dbh.db);
      const connected_apps = await permissions_registry.listConnectedApps(api_server_id);
      const api_server_registry = new SchemaVaultsApiServerRegistry(dbh.db);
      const connected_domains: readonly SchemaVaultsApiServerDomainRef[] = await api_server_registry.getApiServerDomains(api_server_id);

      const orgRegistry = new OrganizationsRegistry(dbh.db)
      const isOrgOwner: boolean = await orgRegistry.isUserOwnerOfOrgOrAdmin(user, owner_organization_id)

      const current_environment = getAppEnvironment();

      return (
        <ApiServerDetailPageView
          api_server={api_server}
          connected_apps={connected_apps}
          connected_domains={connected_domains}
          hardcoded={hardcoded}
          isOrgOwner={isOrgOwner}
          current_environment={current_environment}
        />
      );
    },
    { next_href: `/apis/${encodeURIComponent(raw_api_server_id)}` },
  );
}

export const runtime: ServerRuntime = "nodejs";
