"use client";

import {
  OrganizationsCard,
  OrganizationsStatsRow,
} from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import type { OrganizationDefinition } from "@schemavaults/auth-common";

export interface AdminOrganizationsPageViewProps {
  preloaded: readonly OrganizationDefinition[];
}

export default function AdminOrganizationsPageView({
  preloaded,
}: AdminOrganizationsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <div className="flex w-full flex-col gap-4">
        <OrganizationsStatsRow preloaded={preloaded} />
        <OrganizationsCard cardClassName={"w-full"} preloaded={preloaded} />
      </div>
    </PageContainer>
  );
}
