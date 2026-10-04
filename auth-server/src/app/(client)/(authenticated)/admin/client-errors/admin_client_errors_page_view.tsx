"use client";

import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import {
  ClientErrorsDashboard,
  type ClientErrorsSnapshot,
  DeleteOldClientErrorsCard,
} from "@/components/ClientErrorsDashboard";

export interface AdminClientErrorsPageViewProps {
  snapshot: ClientErrorsSnapshot;
}

function AdminClientErrorsPageView({ snapshot }: AdminClientErrorsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <ClientErrorsDashboard snapshot={snapshot} />
        <DeleteOldClientErrorsCard />
      </div>
    </PageContainer>
  );
}

export default AdminClientErrorsPageView;
