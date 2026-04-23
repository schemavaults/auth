"use client";

import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import { DeleteOldErrorsCard, ErrorsCard } from "@/components/ErrorsTable";
import type { ErrorRow } from "@/lib/auth-db/errors";

export interface AdminErrorsPageViewProps {
  preloaded: readonly ErrorRow[];
}

function AdminErrorsPageView({
  preloaded,
}: AdminErrorsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <div className="flex flex-col gap-6">
        <ErrorsCard cardClassName="w-full" preloaded={preloaded} />
        <DeleteOldErrorsCard />
      </div>
    </PageContainer>
  );
}

export default AdminErrorsPageView;
