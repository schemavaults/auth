"use client";

import { OrganizationsCard } from "@schemavaults/auth-ui";
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
      <OrganizationsCard cardClassName={"w-full"} preloaded={preloaded} />
    </PageContainer>
  );
}
