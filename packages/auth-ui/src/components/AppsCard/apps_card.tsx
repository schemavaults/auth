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
import {
  AppsTable,
  type PreloadedAppsTableDataWithDomainRefs,
} from "@/components/AppsTable";
import type { ListAppsQueryType } from "@schemavaults/app-definitions";

export interface AppsCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  queryType: ListAppsQueryType;
  preloaded?: PreloadedAppsTableDataWithDomainRefs;
  organization_id?: string;
  uuid: () => string;
}

export function AppsCard(props: AppsCardProps): ReactElement {
  const cardTitle = props.cardTitle ?? "Applications";
  const cardDescription =
    props.cardDescription ??
    "View and manage which applications are allowed to access SchemaVaults APIs on your behalf.";

  const cardClassName: string = cn("w-full", props.cardClassName);

  return (
    <Card className={cardClassName}>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <AppsTable
          queryType={props.queryType}
          preloaded={props.preloaded}
          organization_id={props.organization_id}
          uuid={props.uuid}
        />
      </CardContent>
      <CardFooter>
        <div className="flex flex-row items-start justify-start gap-2"></div>
      </CardFooter>
    </Card>
  );
}
