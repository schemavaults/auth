"use client";

import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import {
  ServerTracesDashboard,
  type ServerTraceOperationsSnapshot,
  type ServerTracesSnapshot,
} from "@/components/ServerTracesDashboard";

export interface AdminTracesPageViewProps {
  preloadedTraces: ServerTracesSnapshot;
  preloadedOperations: ServerTraceOperationsSnapshot;
}

function AdminTracesPageView({
  preloadedTraces,
  preloadedOperations,
}: AdminTracesPageViewProps): ReactElement {
  return (
    <PageContainer>
      <ServerTracesDashboard
        preloadedTraces={preloadedTraces}
        preloadedOperations={preloadedOperations}
      />
    </PageContainer>
  );
}

export default AdminTracesPageView;
