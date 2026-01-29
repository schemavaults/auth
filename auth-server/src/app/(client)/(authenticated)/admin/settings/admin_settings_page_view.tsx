"use client";

import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import { ServerSettingsCard } from "@/components/ServerSettingsTable";
import type { ServerSettingRecord } from "@/lib/auth-db/server-settings/types";

export interface AdminSettingsPageViewProps {
  preloaded: readonly ServerSettingRecord[];
}

function AdminSettingsPageView({
  preloaded,
}: AdminSettingsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <ServerSettingsCard cardClassName="w-full" preloaded={preloaded} />
    </PageContainer>
  );
}

export default AdminSettingsPageView;
