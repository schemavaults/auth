import "server-only";
import type { ReactElement } from "react";

import AppsPageView from "./apps_page_view";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import { preloadAppsTable, SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { listUserOrganizationMemberships } from "@/lib/auth-db/organizations/list-user-organization-memberships";
import allowUserOwnedResourceCreation from "@/lib/config/allow-user-owned-resource-creation";
import { withServerTrace } from "@/lib/withServerTrace";
import { connection } from "next/server";
import type { ServerRuntime } from "next";

/**
 * `/apps`: every client application the current user can reach by
 * ownership — their own account's, their organizations', and (for admins)
 * the platform's — with an owner-type filter. The non-admin counterpart of
 * `/admin/apps`.
 */
async function AppsPageServerComponent({
  user,
  dbh,
  redis,
}: IProtectedAuthenticatedServerComponentPageProps): Promise<ReactElement> {
  const [appsResult, membershipsResult, userOwnedCreationResult] =
    await withServerTrace({
      op_name: "GET /apps (preload data)",
      op_category: "subroutine",
      event_id: crypto.randomUUID(),
      callback: async () =>
        await Promise.allSettled([
          preloadAppsTable({
            appsRegistry: new SchemaVaultsAppRegistry(dbh.db),
            list_apps_query_type: "accessible",
            user,
          }),
          listUserOrganizationMemberships(dbh.db, user.uid, user.admin ?? false),
          allowUserOwnedResourceCreation(dbh.db, redis.client),
        ]),
    });

  // On preload failure the card fetches client-side from
  // GET /api/apps?list_apps_query_type=accessible instead.
  const preloaded_apps =
    appsResult.status === "fulfilled" ? appsResult.value : undefined;
  if (appsResult.status === "rejected") {
    console.error("Failed to preload accessible apps for /apps:", appsResult.reason);
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
      "Failed to preload organization memberships for /apps:",
      membershipsResult.reason,
    );
  }

  if (userOwnedCreationResult.status === "rejected") {
    console.error(
      "Failed to load server setting for allow_user_owned_resource_creation on /apps:",
      userOwnedCreationResult.reason,
    );
  }
  // Admins can always create their own apps; for everyone else the create
  // button is offered iff the server setting allows it (POST /api/apps
  // enforces the setting regardless).
  const can_create_personal_apps: boolean =
    user.admin === true ||
    (userOwnedCreationResult.status === "fulfilled"
      ? userOwnedCreationResult.value
      : true);

  return (
    <AppsPageView
      preloaded_apps={preloaded_apps}
      managed_organization_ids={managed_organization_ids}
      can_create_personal_apps={can_create_personal_apps}
      is_admin={user.admin === true}
    />
  );
}

export default async function AppsPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    AppsPageServerComponent,
    { next_href: "/apps" },
  );
}

export const runtime: ServerRuntime = "nodejs";
