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
import { accessLevelSatisfies, getUserAccessLevelForResource, type OwnedResourceAccessLevel } from "@/lib/ownership/resource-access";
import { connection } from "next/server";
import type { ServerRuntime } from "next/types";

export default async function ApiServerDetailPage(
  pageParams: PageProps<"/apis/[api_server_id]">
): Promise<ReactElement> {
  await connection();
  const { api_server_id: raw_api_server_id } = await pageParams.params;
  // Only forward a next_href when the api_server_id is well-formed; a
  // malformed id would 400 after login anyway, so the login redirect
  // carries no destination in that case.
  const parsed_api_server_id = apiServerIdSchema.safeParse(raw_api_server_id);

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
      // Organization members, the owning user of a user-owned API server,
      // and global admins may view; organization owners/admins, the owning
      // user, and global admins may manage. Platform-owned: admin-only.
      const access: OwnedResourceAccessLevel = await getUserAccessLevelForResource(dbh.db, user, api_server);
      if (!accessLevelSatisfies(access, "member")) {
        console.warn(`Blocking request to view API server detail page for '${api_server_id}': user has no access to it`);
        redirectWithError(403, 'forbidden');
      }
      const canManage: boolean = accessLevelSatisfies(access, "admin");

      const permissions_registry = new SchemaVaultsAppToApiPermissionsRegistry(dbh.db);
      const connected_apps = await permissions_registry.listConnectedApps(api_server_id);
      const api_server_registry = new SchemaVaultsApiServerRegistry(dbh.db);
      const connected_domains: readonly SchemaVaultsApiServerDomainRef[] = await api_server_registry.getApiServerDomains(api_server_id);

      const current_environment = getAppEnvironment();

      return (
        <ApiServerDetailPageView
          api_server={api_server}
          connected_apps={connected_apps}
          connected_domains={connected_domains}
          hardcoded={hardcoded}
          isOrgOwner={canManage}
          current_environment={current_environment}
        />
      );
    },
    parsed_api_server_id.success
      ? { next_href: `/apis/${parsed_api_server_id.data}` }
      : undefined,
  );
}

export const runtime: ServerRuntime = "nodejs";
