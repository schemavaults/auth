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
import { userDataSchema, type UserData } from "@schemavaults/auth-common";
import { ShieldCheck, UserRound, UserX } from "lucide-react";
import useSWR from "swr";

export interface UsersStatsRowProps {
  preloaded?: readonly UserData[];
  className?: string;
}

const LIST_ALL_USERS_ENDPOINT = "/api/admin/users/list";

export function UsersStatsRow(props: UsersStatsRowProps): ReactElement {
  const users = useSWR(
    LIST_ALL_USERS_ENDPOINT,
    async (): Promise<readonly UserData[]> => {
      try {
        const response = await fetch(LIST_ALL_USERS_ENDPOINT, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Failed to list users (response status: ${response.status})!`,
          );
        }
        const body: unknown = await response.json();
        if (
          typeof body !== "object" ||
          !body ||
          !("success" in body) ||
          !body.success
        ) {
          throw new Error(
            "Received failure response when attempting to list users",
          );
        }
        if (
          !("data" in body) ||
          typeof body.data !== "object" ||
          !body.data ||
          !("users" in body.data) ||
          !Array.isArray(body.data.users)
        ) {
          throw new Error("Failed to extract 'users' array from response!");
        }

        const usersWithSub = body.data.users.map(
          (user: Record<string, unknown>) => ({
            ...user,
            sub: user.uid,
          }),
        );

        const parsed_users = await userDataSchema
          .array()
          .safeParseAsync(usersWithSub);

        if (!parsed_users.success) {
          console.error(
            `Failed to parse 'users' from response object: `,
            parsed_users.error,
          );
          throw new Error("Failed to parse 'users' from response object!");
        }

        return parsed_users.data;
      } catch (e: unknown) {
        console.error(`Failed to list users: `, e);
        throw new Error(`Failed to list users!`);
      }
    },
    {
      fallbackData: props.preloaded,
    },
  );

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

      <StatCard variant="primary">
        <StatCardHeader>
          <StatCardLabel>Admins</StatCardLabel>
          <StatCardIcon variant="primary">
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
