import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard,
  type IProtectedAuthenticatedServerComponentPageProps,
} from "@/lib/withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import AppDetailPageView from "./app-detail-page-view";
import { type AppId, appIdSchema, type SchemaVaultsApp, type SchemaVaultsAppCallbackUrlRef, type SchemaVaultsAppDomainRef, getAppEnvironment } from "@schemavaults/app-definitions";
import { isHardcodedAppId } from "@schemavaults/app-definitions";
import redirectWithError from "@/lib/redirect-with-error";
import { SchemaVaultsAppToApiPermissionsRegistry } from "@/lib/auth-db/apis";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { accessLevelSatisfies, getUserAccessLevelForResource, type OwnedResourceAccessLevel } from "@/lib/ownership/resource-access";
import type { ServerRuntime } from "next/types";
import { connection } from "next/server";

export default async function AppDetailPage(
  pageParams: PageProps<"/apps/[client_app_id]">
): Promise<ReactElement> {
  await connection();
  const { client_app_id: raw_client_app_id } = await pageParams.params;
  // Only forward a next_href when the client_app_id is well-formed; a
  // malformed id would 400 after login anyway, so the login redirect
  // carries no destination in that case.
  const parsed_client_app_id = appIdSchema.safeParse(raw_client_app_id);
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

      // Organization members, the owning user of a user-owned app, and
      // global admins may view; organization owners/admins, the owning user,
      // and global admins may manage. Platform-owned apps are admin-only.
      const access: OwnedResourceAccessLevel = await getUserAccessLevelForResource(dbh.db, user, app);
      if (!accessLevelSatisfies(access, "member")) {
        console.warn(`Blocking request to view app detail page for app '${client_app_id}': user has no access to it`);
        redirectWithError(403, 'forbidden');
      }
      const canManage: boolean = accessLevelSatisfies(access, "admin");

      const permissions_registry = new SchemaVaultsAppToApiPermissionsRegistry(dbh.db);
      const connected_api_servers = await permissions_registry.listConnectedApiServers(client_app_id);
      const connected_domains: readonly SchemaVaultsAppDomainRef[] = await app_registry.getAppDomains(client_app_id);
      const callback_urls: readonly SchemaVaultsAppCallbackUrlRef[] = await app_registry.getAppCallbackUrls(client_app_id);
      const client_secret_record = hardcoded ? null : await app_registry.getClientSecretRecord(client_app_id);

      const current_environment = getAppEnvironment();

      return (
        <AppDetailPageView
          app={app}
          connected_api_servers={connected_api_servers}
          connected_domains={connected_domains}
          callback_urls={callback_urls}
          client_secret_metadata={
            client_secret_record
              ? {
                  has_client_secret: true,
                  created_at: client_secret_record.created_at,
                  updated_at: client_secret_record.updated_at,
                }
              : { has_client_secret: false, created_at: null, updated_at: null }
          }
          hardcoded={hardcoded}
          isOrgOwner={canManage}
          current_environment={current_environment}
        />
      );
    },
    parsed_client_app_id.success
      ? { next_href: `/apps/${parsed_client_app_id.data}` }
      : undefined,
  );
}

export const runtime: ServerRuntime = "nodejs";
