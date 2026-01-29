"use client";

import { useState, type ReactElement } from "react";
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
  clearUseAppsListCache,
  type PreloadedAppsTableDataWithDomainRefs,
} from "@/components/AppsTable";
import type { ListAppsQueryType } from "@schemavaults/app-definitions";
import CreateAppDialog, {
  CreateAppDialogOpenDispatchContext,
} from "@/components/CreateAppDialog";
import { SCHEMAVAULTS_ORGANIZATION_ID } from "@schemavaults/auth-common";

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
  const [createAppDialogOpen, setCreateAppDialogOpen] =
    useState<boolean>(false);

  return (
    <CreateAppDialogOpenDispatchContext.Provider value={setCreateAppDialogOpen}>
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
          />
        </CardContent>
        <CardFooter>
          <div className="flex flex-row items-start justify-start gap-2"></div>
        </CardFooter>
      </Card>
      <>
        {(props.queryType === "all" || props.queryType === "org") && (
          <CreateAppDialog
            clearFrontendAppsCache={clearUseAppsListCache}
            owner_organization_id={
              props.queryType === "all"
                ? SCHEMAVAULTS_ORGANIZATION_ID
                : props.organization_id
            }
            open={createAppDialogOpen}
            onOpenChange={setCreateAppDialogOpen}
            uuid={props.uuid}
          />
        )}
      </>
    </CreateAppDialogOpenDispatchContext.Provider>
  );
}

export default AppsCard;
