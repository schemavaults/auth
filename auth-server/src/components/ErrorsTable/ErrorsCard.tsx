"use client";

import type { ReactElement } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import { ErrorsTable } from "./ErrorsTable";
import type { ErrorRow } from "@/lib/auth-db/errors";

export interface ErrorsCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly ErrorRow[];
}

export function ErrorsCard(props: ErrorsCardProps): ReactElement {
  const cardTitle = props.cardTitle ?? "Errors";
  const cardDescription =
    props.cardDescription ??
    "Recent server-side exceptions captured from the auth server.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ErrorsTable data={props.preloaded ?? []} />
      </CardContent>
    </Card>
  );
}

export default ErrorsCard;
