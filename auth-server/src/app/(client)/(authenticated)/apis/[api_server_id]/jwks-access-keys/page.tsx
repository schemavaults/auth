import "server-only";

import {
  withAuthenticatedServerComponentRouteGuard,
  type IProtectedAuthenticatedServerComponentPageProps,
} from "@/lib/withAuthenticatedRouteGuard";
import type { ReactElement } from "react";
import JwksAccessKeysPageView from "./jwks-access-keys-page-view";
import {
  type ApiServerId,
  apiServerIdSchema,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import getAuthServerAppId from "@/lib/config/auth-server-app-id";
import redirectWithError from "@/lib/redirect-with-error";
import { loadApiServerDefinitionFromDatabase } from "@/lib/auth-db/apis";
import { OrganizationMembershipRoleType, type OrganizationID } from "@schemavaults/auth-common";
import { getAuthServerOwnerOrganizationId } from "@/lib/config/auth-server-owner-organization";
import { isHardcodedApiServerId } from "@schemavaults/app-definitions";
import isUserInOrganization from "@/lib/isUserInOrganization";
import { JwksAccessKeysRegistry, type JwksAccessKeyStatusQueryResponse } from "@/lib/auth-db/jwks-access-keys";
import { connection } from "next/server";
import type { ServerRuntime } from "next/types";

export default async function JwksAccessKeysPage(
  pageParams: PageProps<"/apis/[api_server_id]/jwks-access-keys">
): Promise<ReactElement> {
  await connection();
  const { api_server_id: raw_api_server_id } = await pageParams.params;
  // Only forward a next_href when the api_server_id is well-formed; a
  // malformed id would 400 after login anyway, so the login redirect
  // carries no destination in that case.
  const parsed_api_server_id = apiServerIdSchema.safeParse(raw_api_server_id);
  return await withAuthenticatedServerComponentRouteGuard(
    async function JwksAccessKeysPageServerComponent({
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
        console.error("[JwksAccessKeysPage] There was an attempt to load a page with an invalid 'api_server_id': ", e);
        redirectWithError(400, "bad_request");
      }

      // Block access to JWKS access keys page for the auth server's own API - it is the JWKS provider
      if (api_server_id === getAuthServerAppId()) {
        console.warn("[JwksAccessKeysPage] Blocking access - the auth server is the JWKS provider");
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

      if (owner_organization_id === getAuthServerOwnerOrganizationId() && !user.admin) {
        console.warn("Blocking request to view JWKS access keys page for a platform-owned API server for non-admin user!")
        redirectWithError(403, 'forbidden');
      }

      const role: OrganizationMembershipRoleType | false = await isUserInOrganization(dbh.db, user, owner_organization_id);
      let canView: boolean = false;
      if (user.admin) {
        canView = true;
      } else if (role === 'admin' || role === 'owner') {
        canView = true;
      }
      if (!canView) {
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
    },
    parsed_api_server_id.success
      ? { next_href: `/apis/${parsed_api_server_id.data}/jwks-access-keys` }
      : undefined,
  );
}

export const runtime: ServerRuntime = "nodejs";
