"use client";

import { ApiServersCard } from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import uuidSync from "@/lib/uuid/uuidSync";

function AdminAPIsPageView(): ReactElement {
  return (
    <PageContainer>
      <ApiServersCard
        cardTitle="All API Servers"
        queryType="all"
        cardClassName={"w-full"}
        uuid={uuidSync}
      />
    </PageContainer>
  );
}

export default AdminAPIsPageView;
