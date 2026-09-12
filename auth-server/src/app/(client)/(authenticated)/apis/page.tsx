import "server-only";
import type { ReactElement } from "react";

import ApisPageView from "./apis_page_view";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import {
  preloadApiServersTable,
  SchemaVaultsApiServerRegistry,
} from "@/lib/auth-db/apis";
import { listUserOrganizationMemberships } from "@/lib/auth-db/organizations/list-user-organization-memberships";
import allowUserOwnedResourceCreation from "@/lib/config/allow-user-owned-resource-creation";
import { withServerTrace } from "@/lib/withServerTrace";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

/**
 * `/apis`: every API server the current user can reach by ownership —
 * their own account's, their organizations', and (for admins) the
 * platform's — with an owner-type filter. The non-admin counterpart of
 * `/admin/apis`.
 */
async function ApisPageServerComponent({
  user,
  dbh,
  redis,
}: IProtectedAuthenticatedServerComponentPageProps): Promise<ReactElement> {
  const [apiServersResult, membershipsResult, userOwnedCreationResult] =
    await withServerTrace({
      op_name: "GET /apis (preload data)",
      op_category: "subroutine",
      event_id: crypto.randomUUID(),
      callback: async () =>
        await Promise.allSettled([
          preloadApiServersTable({
            apiServerRegistry: new SchemaVaultsApiServerRegistry(dbh.db),
            list_api_servers_query_type: "accessible",
            user,
          }),
          listUserOrganizationMemberships(dbh.db, user.uid, user.admin ?? false),
          allowUserOwnedResourceCreation(dbh.db, redis.client),
        ]),
    });

  // On preload failure the card fetches client-side from
  // GET /api/apis?list_apis_query_type=accessible instead.
  const preloaded_api_servers =
    apiServersResult.status === "fulfilled" ? apiServersResult.value : undefined;
  if (apiServersResult.status === "rejected") {
    console.error(
      "Failed to preload accessible API servers for /apis:",
      apiServersResult.reason,
    );
  }

  // Organizations the user administers, so organization-owned rows can
  // expose management actions without a round trip per row.
  const managed_organization_ids: readonly string[] =
    membershipsResult.status === "fulfilled"
      ? membershipsResult.value
          .filter((m) => m.role === "owner" || m.role === "admin")
          .map((m) => m.organization_id)
      : [];
  if (membershipsResult.status === "rejected") {
    console.error(
      "Failed to preload organization memberships for /apis:",
      membershipsResult.reason,
    );
  }

  if (userOwnedCreationResult.status === "rejected") {
    console.error(
      "Failed to load server setting for allow_user_owned_resource_creation on /apis:",
      userOwnedCreationResult.reason,
    );
  }
  // Admins can always create their own API servers; for everyone else the
  // create button is offered iff the server setting allows it
  // (POST /api/apis enforces the setting regardless).
  const can_create_personal_api_servers: boolean =
    user.admin === true ||
    (userOwnedCreationResult.status === "fulfilled"
      ? userOwnedCreationResult.value
      : true);

  return (
    <ApisPageView
      preloaded_api_servers={preloaded_api_servers}
      managed_organization_ids={managed_organization_ids}
      can_create_personal_api_servers={can_create_personal_api_servers}
      is_admin={user.admin === true}
    />
  );
}

export default async function ApisPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    ApisPageServerComponent,
    { next_href: "/apis" },
  );
}

export const runtime: ServerRuntime = "nodejs";
