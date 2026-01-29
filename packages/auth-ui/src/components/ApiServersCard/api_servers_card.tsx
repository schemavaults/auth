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
import type { ListApiServersQueryType } from "@schemavaults/app-definitions";
import {
  ApiServersTable,
  type PreloadedApiServersTableData,
} from "@/components/ApiServersTable";

export interface ApiServersCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  queryType: ListApiServersQueryType;
  organization_id?: string;
  preloaded?: PreloadedApiServersTableData;
  uuid: () => string;
}

export function ApiServersCard(props: ApiServersCardProps): ReactElement {
  const cardTitle = props.cardTitle ?? "API Servers";
  const cardDescription =
    props.cardDescription ??
    "View and manage backend API servers accessible from client applications.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ApiServersTable
          queryType={props.queryType}
          organization_id={props.organization_id}
          preloaded={props.preloaded}
          uuid={props.uuid}
        />
      </CardContent>
      <CardFooter>
        <div className="flex flex-row items-start justify-start gap-2"></div>
      </CardFooter>
    </Card>
  );
}
