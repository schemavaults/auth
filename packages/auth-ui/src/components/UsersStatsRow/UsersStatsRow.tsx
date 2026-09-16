"use client";

import { useMemo, type ReactElement } from "react";
import {
  StatCard,
  StatCardHeader,
  StatCardLabel,
  StatCardValue,
  StatCardDescription,
  StatCardIcon,
  cn,
} from "@schemavaults/ui";
import type { UserData } from "@schemavaults/auth-common";
import { ShieldCheck, UserRound, UserX } from "lucide-react";
import { useAllUsersList } from "@/components/UsersTable/useAllUsersList";

export interface UsersStatsRowProps {
  preloaded?: readonly UserData[];
  className?: string;
}

export function UsersStatsRow(props: UsersStatsRowProps): ReactElement {
  const users = useAllUsersList({ initialData: props.preloaded });

  const stats = useMemo(() => {
    const data = users.data ?? [];
    return {
      total: data.length,
      admins: data.filter((u) => u.admin).length,
      disabled: data.filter((u) => u.disabled).length,
    };
  }, [users.data]);

  const loading = !users.data;
  const disabledVariant: "default" | "destructive" =
    stats.disabled > 0 ? "destructive" : "default";

  return (
    <div
      className={cn(
        "grid w-full grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
        props.className,
      )}
    >
      <StatCard>
        <StatCardHeader>
          <StatCardLabel>Total users</StatCardLabel>
          <StatCardIcon>
            <UserRound />
          </StatCardIcon>
        </StatCardHeader>
        <StatCardValue loading={loading}>{stats.total}</StatCardValue>
        <StatCardDescription>All registered user accounts.</StatCardDescription>
      </StatCard>

      <StatCard>
        <StatCardHeader>
          <StatCardLabel>Admins</StatCardLabel>
          <StatCardIcon>
            <ShieldCheck />
          </StatCardIcon>
        </StatCardHeader>
        <StatCardValue loading={loading}>{stats.admins}</StatCardValue>
        <StatCardDescription>
          Users with administrator privileges.
        </StatCardDescription>
      </StatCard>

      <StatCard variant={disabledVariant}>
        <StatCardHeader>
          <StatCardLabel>Disabled</StatCardLabel>
          <StatCardIcon variant={disabledVariant}>
            <UserX />
          </StatCardIcon>
        </StatCardHeader>
        <StatCardValue loading={loading}>{stats.disabled}</StatCardValue>
        <StatCardDescription>
          Accounts blocked from signing in.
        </StatCardDescription>
      </StatCard>
    </div>
  );
}

export default UsersStatsRow;
