"use client";

import type { ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import UsersTable from "@/components/UsersTable";
import { userDataSchema, type UserData } from "@schemavaults/auth-common";
import useSWR from "swr";

export interface UsersCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly UserData[];
  getUserHref?: (user: UserData) => string;
}

export function UsersCard(props: UsersCardProps): ReactElement {
  const cardTitle = props.cardTitle ?? "Users";
  const cardDescription =
    props.cardDescription ?? "View and manage registered users.";

  const cardClassName: string = cn("w-full", props.cardClassName);
  const getUserHref = props.getUserHref;

  const listAllUsersEndpoint = "/api/admin/users/list";

  const users = useSWR(
    listAllUsersEndpoint,
    async (): Promise<readonly UserData[]> => {
      try {
        const response = await fetch(listAllUsersEndpoint, {
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

        const users: readonly UserData[] = parsed_users.data;
        return users;
      } catch (e: unknown) {
        console.error(`Failed to list users: `, e);
        throw new Error(`Failed to list users!`);
      }
    },
    {
      fallbackData: props.preloaded,
    },
  );

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <UsersTable users={users} getUserHref={getUserHref} />
      </CardContent>
      <CardFooter>
        <div className="flex flex-row items-start justify-start gap-2"></div>
      </CardFooter>
    </Card>
  );
}
