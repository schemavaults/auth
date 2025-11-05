"use client";

import { InviteCodesCard } from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import { PageContainer } from "@/components/PageContainer";
import type { InviteCodeDefinition } from "@schemavaults/auth";

export interface InviteCodesPageViewProps {
  preloaded: readonly InviteCodeDefinition[];
}

function InviteCodesPageView({
  preloaded,
}: InviteCodesPageViewProps): ReactElement {
  return (
    <PageContainer>
      <InviteCodesCard cardClassName={"w-full"} preloaded={preloaded} />
    </PageContainer>
  );
}

export default InviteCodesPageView;
