import "server-only";

import AdminOrganizationsPageView from "./admin_organizations_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import { OrganizationsRegistry } from "@/lib/auth-db";
import type { ServerRuntime } from "next";
import type { OrganizationDefinition } from "@schemavaults/auth-common";
import { connection } from "next/server";

async function PreloadedOrganizationsPage({
  user,
  dbh,
}: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!",
    );
  }

  const registry = new OrganizationsRegistry(dbh.db);

  const organizations: readonly OrganizationDefinition[] =
    await registry.listAllOrganizations();

  return <AdminOrganizationsPageView preloaded={organizations} />;
}

async function OrganizationsServerComponent(): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(PreloadedOrganizationsPage);
}

export default OrganizationsServerComponent;

export const runtime: ServerRuntime = "nodejs";
