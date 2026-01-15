"use client";

import { UsersCard } from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import { PageContainer } from "@/components/PageContainer";
import type { UserData } from "@schemavaults/auth-common";

export interface AdminUsersPageViewProps {
  preloaded: readonly UserData[];
}

export default function AdminUsersPageView({
  preloaded,
}: AdminUsersPageViewProps): ReactElement {
  return (
    <PageContainer>
      <UsersCard cardClassName={"w-full"} preloaded={preloaded} />
    </PageContainer>
  );
}