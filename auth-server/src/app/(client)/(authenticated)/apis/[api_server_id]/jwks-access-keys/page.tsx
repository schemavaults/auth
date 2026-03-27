import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard,
  type IProtectedAuthenticatedServerComponentPageProps,
} from "@/lib/withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import JwksAccessKeysPageView from "./jwks-access-keys-page-view";
import { type ApiServerId, apiServerIdSchema, SCHEMAVAULTS_AUTH_SERVER, type SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";
import redirectWithError from "@/lib/redirect-with-error";
import { loadApiServerDefinitionFromDatabase } from "@/lib/auth-db/apis";
import { SCHEMAVAULTS_ORGANIZATION_ID, type OrganizationID } from "@schemavaults/auth-common";
import { isHardcodedApiServerId } from "@schemavaults/app-definitions";
import { JwksAccessKeysRegistry, type JwksAccessKeyStatusQueryResponse } from "@/lib/auth-db/jwks-access-keys";

interface PageParams {
  params: Promise<{ api_server_id: string }>;
}

export default async function JwksAccessKeysPage(
  pageParams: PageParams
): Promise<ReactElement> {
  return await withAuthenticatedServerComponentRouteGuard(
    async function JwksAccessKeysPageServerComponent({
      dbh,
      user,
      user_organizations
    }: IProtectedAuthenticatedServerComponentPageProps): Promise<ReactElement> {
      let api_server_id: ApiServerId;
      try {
        const parsed_api_server_id = await apiServerIdSchema.safeParseAsync((await pageParams.params).api_server_id)
        if (!parsed_api_server_id.success) {
          throw parsed_api_server_id.error;
        }
        api_server_id = parsed_api_server_id.data;
      } catch (e: unknown) {
        console.error("[JwksAccessKeysPage] There was an attempt to load a page with an invalid 'api_server_id': ", e);
        redirectWithError(400, "bad_request");
      }

      // Block access to JWKS access keys page for schemavaults-auth - it is the JWKS provider
      if (api_server_id === SCHEMAVAULTS_AUTH_SERVER.api_server_id) {
        console.warn("[JwksAccessKeysPage] Blocking access - schemavaults-auth is the JWKS provider");
        redirectWithError(403, 'forbidden');
      }

      const hardcoded: boolean = isHardcodedApiServerId(api_server_id)
      if (hardcoded && !user.admin) {
        console.warn("[JwksAccessKeysPage] Blocking access - hardcoded API servers can only be viewed by admins")
        redirectWithError(403, 'forbidden');
      }


      const api_server: SchemaVaultsApiServerDefinition = await loadApiServerDefinitionFromDatabase({ api_server_id, db: dbh.db });
      const owner_organization_id: OrganizationID | null | undefined = api_server['owner_organization_id'];
      if (!owner_organization_id || typeof owner_organization_id !== 'string') {
        console.error(`Failed to resolve 'owner_organization_id' for API server: '${api_server_id}'`);
        redirectWithError(500, "internal_server_error");
      }

      if (owner_organization_id === SCHEMAVAULTS_ORGANIZATION_ID && !user.admin) {
        console.warn("Blocking request to view JWKS access keys page for SchemaVaults-owned API server for non-admin user!")
        redirectWithError(403, 'forbidden');
      }

      if (!user.admin && !user_organizations.includes(owner_organization_id)) {
        console.warn("[JwksAccessKeysPage] Blocking access - user does not appear to be in the owner organization!")
        redirectWithError(403, 'forbidden');
      }

      const jwks_access_key_registry = new JwksAccessKeysRegistry(dbh.db);

      let key_metadata: JwksAccessKeyStatusQueryResponse | null
      try {
        key_metadata = await jwks_access_key_registry.getKeyMetadata(api_server_id);
      } catch (e: unknown) {
        console.error(`Error loading key metadata for API server with ID '${api_server_id}': `, e);
        redirectWithError(500, 'internal_server_error');
      }

      return (
        <JwksAccessKeysPageView
          api_server_id={api_server_id}
          preloaded_latest_jwks_access_keys_metadata={{
            success: true,
            key_metadata: key_metadata ?? false
          }}
        />
      );
    }
  );
}
