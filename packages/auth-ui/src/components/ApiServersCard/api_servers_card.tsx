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
import type {
  ApiServerId,
  ListApiServersQueryType,
} from "@schemavaults/app-definitions";
import {
  ApiServersTable,
  clearUseApiServersCache,
  type PreloadedApiServersTableDataWithDomainRefs,
} from "@/components/ApiServersTable";
import CreateApiServerDialog, {
  CreateApiServerDialogOpenDispatchContext,
} from "@/components/CreateApiServerDialog";
import CreateApiServerDomainDialog, {
  CreateApiServerDomainDialogOpenContext,
  CreateApiServerDomainDialogOpenDispatchContext,
} from "@/components/CreateApiServerDomainDialog";
import { useAuthUiOwnerOrganizationId } from "@/components/OwnerOrganizationProvider";
import ConnectAppToApiDialog, {
  ConnectAppToApiDialogOpenDispatchContext,
} from "@/components/ConnectAppToApiDialog";

export interface ApiServersCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  queryType: ListApiServersQueryType;
  organization_id?: string;
  preloaded?: PreloadedApiServersTableDataWithDomainRefs;
  uuid: () => string;
  showConnectAppToApi?: boolean;
  isOrgOwner?: boolean;
}

export function ApiServersCard(props: ApiServersCardProps): ReactElement {
  const ownerOrganizationId: string = useAuthUiOwnerOrganizationId();
  const cardTitle = props.cardTitle ?? "API Servers";
  const cardDescription =
    props.cardDescription ??
    "View and manage backend API servers accessible from client applications.";

  const cardClassName: string = cn("w-full", props.cardClassName);
  const [createApiServerDialogOpen, setCreateApiServerDialogOpen] =
    useState<boolean>(false);
  const [connectAppToApiDialogOpen, setConnectAppToApiDialogOpen] =
    useState<boolean>(false);
  const [isAddApiServerDomainDialogOpen, setAddApiServerDomainDialogOpen] =
    useState<ApiServerId | false>(false);

  return (
    <CreateApiServerDialogOpenDispatchContext.Provider
      value={setCreateApiServerDialogOpen}
    >
      <ConnectAppToApiDialogOpenDispatchContext.Provider
        value={setConnectAppToApiDialogOpen}
      >
        <CreateApiServerDomainDialogOpenDispatchContext.Provider
          value={setAddApiServerDomainDialogOpen}
        >
          <CreateApiServerDomainDialogOpenContext.Provider
            value={isAddApiServerDomainDialogOpen}
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
                  isOrgOwner={props.isOrgOwner}
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
                  ? ownerOrganizationId
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
            {(props.queryType === "all" ||
              (props.queryType === "org" && props.isOrgOwner)) && (
              <CreateApiServerDomainDialog
                open={typeof isAddApiServerDomainDialogOpen === "string"}
                onOpenChange={(val: boolean): void => {
                  if (!val) {
                    setAddApiServerDomainDialogOpen(false);
                  }
                }}
                uuid={props.uuid}
              />
            )}
          </CreateApiServerDomainDialogOpenContext.Provider>
        </CreateApiServerDomainDialogOpenDispatchContext.Provider>
      </ConnectAppToApiDialogOpenDispatchContext.Provider>
    </CreateApiServerDialogOpenDispatchContext.Provider>
  );
}

export default ApiServersCard;
