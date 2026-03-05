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
import { ServerTracesTable } from "./ServerTracesTable";
import { useServerTraces } from "./useServerTraces";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";

export interface ServerTracesCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  preloaded?: readonly ServerTraceRow[];
}

export function ServerTracesCard(props: ServerTracesCardProps): ReactElement {
  const cardTitle = props.cardTitle ?? "Server Traces";
  const cardDescription =
    props.cardDescription ??
    "View server operation traces and performance data.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  const traces = useServerTraces({
    initialData: props.preloaded,
  });

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ServerTracesTable traces={traces} />
      </CardContent>
    </Card>
  );
}

export default ServerTracesCard;
