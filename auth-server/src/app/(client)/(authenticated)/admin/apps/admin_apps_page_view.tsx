"use client";

import { AppsCard } from "@schemavaults/auth-ui";
import { cn } from "@schemavaults/ui";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { PageContainer } from "@/components/PageContainer";

function AdminAppsPageView(): ReactElement {
  return (
    <PageContainer>
      <AppsCard
        cardTitle="All Applications"
        cardDescription="View and manage available SchemaVaults client applications."
        queryType="all"
        cardClassName={"w-full"}
      />
    </PageContainer>
  );
}

export default AdminAppsPageView;
