import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard,
  type IProtectedAuthenticatedServerComponentPageProps,
} from "@/lib/withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import AppDetailPageView from "./app-detail-page-view";
import { type AppId, appIdSchema, type SchemaVaultsApp, type SchemaVaultsAppDomainRef, getAppEnvironment } from "@schemavaults/app-definitions";
import { isHardcodedAppId } from "@schemavaults/app-definitions";
import redirectWithError from "@/lib/redirect-with-error";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db/apis";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { OrganizationMembershipRoleType, type OrganizationID } from "@schemavaults/auth-common";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import OrganizationsRegistry from "@/lib/auth-db/organizations";
import isUserInOrganization from "@/lib/isUserInOrganization";
import type { ServerRuntime } from "next/types";
import { connection } from "next/server";

export default async function AppDetailPage(
  pageParams: PageProps<"/apps/[client_app_id]">
): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    async function AppDetailPageServerComponent({
      dbh,
      user,
    }: IProtectedAuthenticatedServerComponentPageProps): Promise<ReactElement> {
      let client_app_id: AppId;
      try {
        const parsed_app_id = await appIdSchema.safeParseAsync((await pageParams.params).client_app_id)
        if (!parsed_app_id.success) {
          throw parsed_app_id.error;
        }
        client_app_id = parsed_app_id.data;
      } catch (e: unknown) {
        console.error("[AppDetailPage] There was an attempt to load a page with an invalid 'client_app_id': ", e);
        redirectWithError(400, "bad_request");
      }

      const hardcoded: boolean = isHardcodedAppId(client_app_id)
      if (hardcoded && !user.admin) {
        redirectWithError(403, 'forbidden');
      }

      const app_registry = new SchemaVaultsAppRegistry(dbh.db);
      const app: SchemaVaultsApp | null = await app_registry.getApp(client_app_id);
      if (!app) {
        redirectWithError(404, "app_id_not_found");
      }

      const owner_organization_id: OrganizationID | null | undefined = app['owner_organization_id'];
      if (!owner_organization_id || typeof owner_organization_id !== 'string') {
        console.error(`Failed to resolve 'owner_organization_id' for app: '${client_app_id}'`);
        redirectWithError(500, "internal_server_error");
      }

      if (owner_organization_id === getAuthServerOwnerOrganizationId() && !user.admin) {
        console.warn("Blocking request to view app detail page for a platform-owned app for non-admin user!")
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
      const connected_api_servers = await permissions_registry.listConnectedApiServers(client_app_id);
      const connected_domains: readonly SchemaVaultsAppDomainRef[] = await app_registry.getAppDomains(client_app_id);

      const orgRegistry = new OrganizationsRegistry(dbh.db)
      const isOrgOwner: boolean = await orgRegistry.isUserOwnerOfOrgOrAdmin(user, owner_organization_id)

      const current_environment = getAppEnvironment();

      return (
        <AppDetailPageView
          app={app}
          connected_api_servers={connected_api_servers}
          connected_domains={connected_domains}
          hardcoded={hardcoded}
          isOrgOwner={isOrgOwner}
          current_environment={current_environment}
        />
      );
    }
  );
}

export const runtime: ServerRuntime = "nodejs";
