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
  RequestedResourceOwnership,
} from "@schemavaults/app-definitions";
import { useCurrentUser } from "@schemavaults/auth-react-provider";
import type { OwnerTypeFilterValue } from "@/components/OwnerTypeFilter";
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
  /**
   * For the "accessible" query: ids of the organizations in which the
   * viewer is an owner/admin (decides which rows expose management
   * actions).
   */
  managedOrganizationIds?: readonly string[];
  /** Client-side filter on each row's resolved owner type. */
  ownerTypeFilter?: OwnerTypeFilterValue;
  /**
   * Whether the card offers API server creation at all (default true).
   * Pages set this to false when the `allow_user_owned_resource_creation`
   * server setting is disabled for a non-admin viewer.
   */
  canCreate?: boolean;
}

/**
 * @description Who an API server created from a card of the given query
 * type belongs to: platform-owned from the admin "all" list,
 * organization-owned from an organization page, user-owned from the
 * "owned" (your API servers) card. Returns null when the card cannot
 * create API servers.
 */
function resolveCreateOwnershipForCard(
  queryType: ListApiServersQueryType,
  organization_id: string | undefined,
  platformOrganizationId: string,
  currentUserUid: string | undefined,
): RequestedResourceOwnership | null {
  switch (queryType) {
    case "all":
      return { owner_type: "platform" };
    case "org":
      return organization_id && organization_id !== platformOrganizationId
        ? { owner_type: "organization", owner_organization_id: organization_id }
        : { owner_type: "platform" };
    case "owned":
    case "accessible":
      // The "accessible" page creates personal API servers;
      // organization-owned ones are created from the organization's page
      // and platform-owned ones from the admin console.
      return currentUserUid
        ? { owner_type: "user", owner_uid: currentUserUid }
        : null;
    default:
      return null;
  }
}

export function ApiServersCard(props: ApiServersCardProps): ReactElement {
  const ownerOrganizationId: string = useAuthUiOwnerOrganizationId();
  const currentUser = useCurrentUser();
  const createOwnership: RequestedResourceOwnership | null =
    resolveCreateOwnershipForCard(
      props.queryType,
      props.organization_id,
      ownerOrganizationId,
      currentUser?.uid,
    );
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
                  managedOrganizationIds={props.managedOrganizationIds}
                  ownerTypeFilter={props.ownerTypeFilter}
                  canCreate={props.canCreate ?? true}
                />
              </CardContent>
              <CardFooter>
                <div className="flex flex-row items-start justify-start gap-2"></div>
              </CardFooter>
            </Card>
            {(props.canCreate ?? true) && createOwnership && (
              <CreateApiServerDialog
                clearApiServersCache={clearUseApiServersCache}
                ownership={createOwnership}
                open={createApiServerDialogOpen}
                onOpenChange={setCreateApiServerDialogOpen}
                uuid={props.uuid}
              />
            )}
            {(props.queryType === "all" || props.showConnectAppToApi) && (
              <ConnectAppToApiDialog
                open={connectAppToApiDialogOpen}
                onOpenChange={setConnectAppToApiDialogOpen}
              />
            )}
            {(props.queryType === "all" ||
              props.queryType === "owned" ||
              props.queryType === "accessible" ||
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
