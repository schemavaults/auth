"use client";

import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import { ErrorsCard } from "@/components/ErrorsTable";
import type { ErrorRow } from "@/lib/auth-db/errors";

export interface AdminErrorsPageViewProps {
  preloaded: readonly ErrorRow[];
}

function AdminErrorsPageView({
  preloaded,
}: AdminErrorsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <ErrorsCard cardClassName="w-full" preloaded={preloaded} />
    </PageContainer>
  );
}

export default AdminErrorsPageView;
