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
import { SCHEMAVAULTS_ORGANIZATION_ID, type OrganizationID } from "@schemavaults/auth-common";
import { OrganizationsRegistry } from "@/lib/auth-db";
import isUserInOrganization from "@/lib/isUserInOrganization";

interface PageParams {
  params: Promise<{ api_server_id: string }>;
}

export default async function ApiServerDetailPage(
  pageParams: PageParams
): Promise<ReactElement> {
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

      if (owner_organization_id === SCHEMAVAULTS_ORGANIZATION_ID && !user.admin) {
        console.warn("Blocking request to view API server detail page for SchemaVaults-owned API server for non-admin user!")
        redirectWithError(403, 'forbidden');
      }

      if (!user.admin && (await isUserInOrganization(user, owner_organization_id, dbh.db)) === false) {
        redirectWithError(403, 'forbidden');
      }

      const permissions_registry = new SchemaVaultsAppToApiPermissionsRegistry(dbh.db);
      const connected_apps = await permissions_registry.listConnectedApps(api_server_id);
      const api_server_registry = new SchemaVaultsApiServerRegistry(dbh.db);
      const connected_domains: SchemaVaultsApiServerDomainRef[] = await api_server_registry.getApiServerDomains(api_server_id);

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
    }
  );
}
