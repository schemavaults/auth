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
import type { UserData } from "@schemavaults/auth-common";
import { useAllUsers } from "./useAllUsers";

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

  const users = useAllUsers({ preloaded: props.preloaded });

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
