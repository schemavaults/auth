"use client";

import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import { ServerTracesCard } from "@/components/ServerTracesTable";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";

export interface AdminTracesPageViewProps {
  preloaded: readonly ServerTraceRow[];
}

function AdminTracesPageView({
  preloaded,
}: AdminTracesPageViewProps): ReactElement {
  return (
    <PageContainer>
      <ServerTracesCard cardClassName="w-full" preloaded={preloaded} />
    </PageContainer>
  );
}

export default AdminTracesPageView;
