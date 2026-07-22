"use client";

import { ApiServersCard, type PreloadedApiServersTableDataWithDomainRefs } from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import uuidSync from "@/lib/uuid/uuidSync";

export interface AdminAPIsPageViewProps {
  preloaded: PreloadedApiServersTableDataWithDomainRefs;
}

function AdminAPIsPageView({ preloaded }: AdminAPIsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <ApiServersCard
        cardTitle="All API Servers"
        queryType="all"
        cardClassName={"w-full"}
        preloaded={preloaded}
        uuid={uuidSync}
      />
    </PageContainer>
  );
}

export default AdminAPIsPageView;
