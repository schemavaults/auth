"use client";

import { AppsCard, type PreloadedAppsTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import uuidSync from "@/lib/uuid/uuidSync";

export interface AdminAppsPageViewProps {
  preloaded: PreloadedAppsTableDataWithDomainRefs;
}

function AdminAppsPageView({ preloaded }: AdminAppsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <AppsCard
        cardTitle="All Applications"
        cardDescription="View and manage available SchemaVaults client applications."
        queryType="all"
        cardClassName={"w-full"}
        preloaded={preloaded}
        uuid={uuidSync}
      />
    </PageContainer>
  );
}

export default AdminAppsPageView;
