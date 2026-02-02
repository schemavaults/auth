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
import type { ListApiServersQueryType } from "@schemavaults/app-definitions";
import {
  ApiServersTable,
  clearUseApiServersCache,
  type PreloadedApiServersTableData,
} from "@/components/ApiServersTable";
import CreateApiServerDialog, {
  CreateApiServerDialogOpenDispatchContext,
} from "@/components/CreateApiServerDialog";
import { SCHEMAVAULTS_ORGANIZATION_ID } from "@schemavaults/auth-common";
import ConnectAppToApiDialog, {
  ConnectAppToApiDialogOpenDispatchContext,
} from "@/components/ConnectAppToApiDialog";

export interface ApiServersCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  queryType: ListApiServersQueryType;
  organization_id?: string;
  preloaded?: PreloadedApiServersTableData;
  uuid: () => string;
  showConnectAppToApi?: boolean;
}

export function ApiServersCard(props: ApiServersCardProps): ReactElement {
  const cardTitle = props.cardTitle ?? "API Servers";
  const cardDescription =
    props.cardDescription ??
    "View and manage backend API servers accessible from client applications.";

  const cardClassName: string = cn("w-full", props.cardClassName);
  const [createApiServerDialogOpen, setCreateApiServerDialogOpen] =
    useState<boolean>(false);
  const [connectAppToApiDialogOpen, setConnectAppToApiDialogOpen] =
    useState<boolean>(false);

  return (
    <CreateApiServerDialogOpenDispatchContext.Provider
      value={setCreateApiServerDialogOpen}
    >
      <ConnectAppToApiDialogOpenDispatchContext.Provider
        value={setConnectAppToApiDialogOpen}
      >
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
              showConnectAppToApi={props.showConnectAppToApi}
            />
          </CardContent>
          <CardFooter>
            <div className="flex flex-row items-start justify-start gap-2"></div>
          </CardFooter>
        </Card>
        <CreateApiServerDialog
          clearApiServersCache={clearUseApiServersCache}
          owner_organization_id={
            props.queryType === "all"
              ? SCHEMAVAULTS_ORGANIZATION_ID
              : props.organization_id
          }
          open={createApiServerDialogOpen}
          onOpenChange={setCreateApiServerDialogOpen}
          uuid={props.uuid}
        />
        {(props.queryType === "all" || props.showConnectAppToApi) && (
          <ConnectAppToApiDialog
            open={connectAppToApiDialogOpen}
            onOpenChange={setConnectAppToApiDialogOpen}
          />
        )}
      </ConnectAppToApiDialogOpenDispatchContext.Provider>
    </CreateApiServerDialogOpenDispatchContext.Provider>
  );
}

export default ApiServersCard;
