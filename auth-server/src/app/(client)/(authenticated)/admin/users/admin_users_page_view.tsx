"use client";

import { UsersCard, UsersStatsRow } from "@schemavaults/auth-ui";
import type { ReactElement } from "react";
import PageContainer from "@/components/PageContainer";
import type { UserData } from "@schemavaults/auth-common";

export interface AdminUsersPageViewProps {
  preloaded: readonly UserData[];
}

export default function AdminUsersPageView({
  preloaded,
}: AdminUsersPageViewProps): ReactElement {
  return (
    <PageContainer>
      <div className="flex w-full flex-col gap-4">
        <UsersStatsRow preloaded={preloaded} />
        <UsersCard
          cardClassName={"w-full"}
          preloaded={preloaded}
          getUserHref={(user: UserData): string => `/admin/users/${user.uid}`}
        />
      </div>
    </PageContainer>
  );
}
