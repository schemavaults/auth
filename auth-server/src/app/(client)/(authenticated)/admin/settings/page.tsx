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
import { BrandingAssetsRegistry } from "@/lib/auth-db/branding";
import type { BrandingAssetMetadataRecord } from "@/lib/auth-db/branding";
import { connection } from "next/server";

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

  const brandingRegistry = new BrandingAssetsRegistry(dbh.db);
  const brandingAssets: BrandingAssetMetadataRecord[] =
    await brandingRegistry.listAssetMetadata();

  return (
    <AdminSettingsPageView
      preloaded={settings}
      preloadedBrandingAssets={brandingAssets}
    />
  );
}

export default async function AdminSettingsServerComponent(): Promise<ReactElement> {
  await connection();
  return await withAdminServerComponentRouteGuard(PreloadedAdminSettingsPage);
}

export const runtime: ServerRuntime = "nodejs";
