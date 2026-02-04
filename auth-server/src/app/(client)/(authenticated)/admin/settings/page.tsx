import "server-only";

import AdminSettingsPageView from "./admin_settings_page_view";
import type { ReactElement } from "react";
import {
  type IProtectedAdminServerComponentPageProps,
  withAdminServerComponentRouteGuard,
} from "@/lib/withAdminRouteGuard";
import type { ServerRuntime } from "next";
import { ServerSettingsRegistry } from "@/lib/auth-db/server-settings";
import type { ServerSettingRecord } from "@/lib/auth-db/server-settings";

async function PreloadedAdminSettingsPage({
  user,
  dbh,
}: IProtectedAdminServerComponentPageProps): Promise<ReactElement> {
  if (!user.admin) {
    throw new Error(
      "Expected user to have been asserted to be an admin by this point!"
    );
  }

  const registry = new ServerSettingsRegistry(dbh.db);
  const settings: ServerSettingRecord[] = await registry.listAllSettings();

  return <AdminSettingsPageView preloaded={settings} />;
}

export default async function AdminSettingsServerComponent(): Promise<ReactElement> {
  return await withAdminServerComponentRouteGuard(PreloadedAdminSettingsPage);
}

export const runtime: ServerRuntime = "edge";
export const dynamic = "force-dynamic";
