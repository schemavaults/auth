import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard,
  type IProtectedAuthenticatedServerComponentPageProps,
} from "@/lib/withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import AppDetailPageView from "./app-detail-page-view";
import { type AppId, appIdSchema, type SchemaVaultsApp } from "@schemavaults/app-definitions";
import { isHardcodedAppId } from "@schemavaults/app-definitions";
import redirectWithError from "@/lib/redirect-with-error";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db/apis";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { SCHEMAVAULTS_ORGANIZATION_ID, type OrganizationID } from "@schemavaults/auth-common";

interface PageParams {
  params: Promise<{ client_app_id: string }>;
}

export default async function AppDetailPage(
  pageParams: PageParams
): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard(
    async function AppDetailPageServerComponent({
      dbh,
      user,
      user_organizations
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

      if (owner_organization_id === SCHEMAVAULTS_ORGANIZATION_ID && !user.admin) {
        console.warn("Blocking request to view app detail page for SchemaVaults-owned app for non-admin user!")
        redirectWithError(403, 'forbidden');
      }

      if (!user.admin && !user_organizations.includes(owner_organization_id)) {
        redirectWithError(403, 'forbidden');
      }

      const permissions_registry = new SchemaVaultsAppToApiPermissionsRegistry(dbh.db);
      const connected_api_servers = await permissions_registry.listConnectedApiServers(client_app_id);

      return (
        <AppDetailPageView
          app={app}
          connected_api_servers={connected_api_servers}
        />
      );
    }
  );
}
