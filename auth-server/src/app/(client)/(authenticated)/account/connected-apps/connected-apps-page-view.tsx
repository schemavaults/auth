"use client";

import type { ReactElement } from "react";
import type { ConnectedApp } from "@schemavaults/auth-common";
import PageContainer from "@/components/PageContainer";
import { ConnectedAppsCard } from "@/components/ConnectedApps";

export interface ConnectedAppsPageViewProps {
  preloaded?: readonly ConnectedApp[];
}

export default function ConnectedAppsPageView({
  preloaded,
}: ConnectedAppsPageViewProps): ReactElement {
  return (
    <PageContainer>
      <ConnectedAppsCard className="grow" preloaded={preloaded} />
    </PageContainer>
  );
}
