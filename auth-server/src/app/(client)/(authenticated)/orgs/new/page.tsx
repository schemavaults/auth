import "server-only";
import type { ReactElement } from "react";

import CreateOrganizationPageView from "./create-organization-page-view";
import {
  type IProtectedAuthenticatedServerComponentPageProps,
  withAuthenticatedServerComponentRouteGuard,
} from "@/lib/withAuthenticatedRouteGuard";
import adminOnlyOrganizationCreation from "@/lib/config/admin-only-organization-creation";
import redirectWithError from "@/lib/redirect-with-error";
import { connection } from "next/server";
import type { ServerRuntime } from "next/types";

async function CreateOrganizationPageServerComponent(
  { user, dbh, redis }: IProtectedAuthenticatedServerComponentPageProps
): Promise<ReactElement> {
  let adminOnly: boolean;
  try {
    adminOnly = await adminOnlyOrganizationCreation(dbh.db, redis.client);
  } catch (e: unknown) {
    console.error(
      "Failed to load server setting for admin_only_organization_creation on create-organization page: ",
      e,
    );
    redirectWithError(500, "load_server_config_failure");
  }

  if (adminOnly && user?.admin !== true) {
    redirectWithError(403, "forbidden");
  }

  return <CreateOrganizationPageView />;
}

export default async function CreateOrganizationPage(): Promise<ReactElement> {
  await connection();
  return await withAuthenticatedServerComponentRouteGuard(
    CreateOrganizationPageServerComponent,
    { next_href: "/orgs/new" },
  );
}

export const runtime: ServerRuntime = "nodejs";
