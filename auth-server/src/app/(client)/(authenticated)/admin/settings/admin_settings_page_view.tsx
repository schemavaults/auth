"use client";

import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import { ServerSettingsCard } from "@/components/ServerSettingsTable";
import { BrandingAssetsCard } from "@/components/BrandingAssets";
import { PlatformOrganizationCard } from "@/components/PlatformOrganizationCard";
import type { ServerSettingRecord } from "@/lib/auth-db/server-settings/types";
import type { BrandingAssetMetadataRecord } from "@/lib/auth-db/branding/types";

export interface AdminSettingsPageViewProps {
  preloaded: readonly ServerSettingRecord[];
  preloadedBrandingAssets?: readonly BrandingAssetMetadataRecord[];
}

function AdminSettingsPageView({
  preloaded,
  preloadedBrandingAssets,
}: AdminSettingsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <div className="flex w-full flex-col gap-6">
        <ServerSettingsCard cardClassName="w-full" preloaded={preloaded} />
        <PlatformOrganizationCard cardClassName="w-full" />
        <BrandingAssetsCard
          cardClassName="w-full"
          preloaded={preloadedBrandingAssets}
        />
      </div>
    </PageContainer>
  );
}

export default AdminSettingsPageView;
