"use client";

import {
  AppsCard,
  OwnerTypeFilter,
  type OwnerTypeFilterValue,
  type PreloadedAppsTableDataWithDomainRefs,
} from "@schemavaults/auth-ui";
import { Card } from "@schemavaults/ui";
import { useState, type ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import uuidSync from "@/lib/uuid/uuidSync";
import { useAuthServerFriendlyName } from "@/components/Wordmark";

export interface AdminAppsPageViewProps {
  preloaded: PreloadedAppsTableDataWithDomainRefs;
}

function AdminAppsPageView({ preloaded }: AdminAppsPageViewProps): ReactElement {
  const friendlyName: string = useAuthServerFriendlyName();
  const [ownerTypeFilter, setOwnerTypeFilter] =
    useState<OwnerTypeFilterValue>("all");
  return (
    <PageContainer>
      <div className="flex w-full flex-col gap-4">
        <Card
          className="flex w-full flex-row flex-wrap items-center justify-between gap-2 px-6 py-4"
          data-testid="admin-apps-page-toolbar"
        >
          <p className="text-sm text-muted-foreground">Filter by owner</p>
          {/* Admins see every row, including the ownerless clients created
              through OAuth 2.0 dynamic client registration. */}
          <OwnerTypeFilter
            value={ownerTypeFilter}
            onValueChange={setOwnerTypeFilter}
            showPersonal
            showPlatform
            showDynamicClientRegistration
          />
        </Card>
        <AppsCard
          cardTitle="All Applications"
          cardDescription={`View and manage available ${friendlyName} client applications.`}
          queryType="all"
          cardClassName={"w-full"}
          preloaded={preloaded}
          ownerTypeFilter={ownerTypeFilter}
          uuid={uuidSync}
        />
      </div>
    </PageContainer>
  );
}

export default AdminAppsPageView;
