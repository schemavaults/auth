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
import type { OwnerTypeFilterValue } from "@/components/OwnerTypeFilter";
import {
  hasAvailableResourceOwnership,
  preferredResourceOwnershipForList,
  useResourceOwnershipChoices,
  type CreateResourceOwnershipOptions,
  type PreferredResourceOwnership,
} from "@/components/ResourceOwnershipPicker";
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
  /**
   * Display name of `organization_id` (organization pages), shown in the
   * create dialog's organization picker.
   */
  organization_name?: string;
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
  /**
   * Client-side filter on each row's resolved owner type. Also picks the
   * owner the create dialog preselects on the "all" / "owned" /
   * "accessible" lists (e.g. "organization" → an organization).
   */
  ownerTypeFilter?: OwnerTypeFilterValue;
  /**
   * Whether the card offers API server creation at all (default true). The
   * "Create API" button is also hidden while the viewer cannot pick any
   * owner in the create dialog.
   */
  canCreate?: boolean;
  /**
   * Whether the create dialog offers personal (user-owned) API servers:
   * false when the `allow_user_owned_resource_creation` server setting is
   * disabled for a non-admin viewer (default true; the server enforces it
   * regardless).
   */
  canCreatePersonal?: boolean;
}

export function ApiServersCard(props: ApiServersCardProps): ReactElement {
  const ownerOrganizationId: string = useAuthUiOwnerOrganizationId();
  // Lists whose rows the viewer may manage (add domains) and to which they
  // may add API servers.
  const canManageListedApiServers: boolean =
    props.queryType === "all" ||
    props.queryType === "owned" ||
    props.queryType === "accessible" ||
    (props.queryType === "org" && !!props.isOrgOwner);
  // The owner the create dialog preselects follows the list it was opened
  // from; the dialog's "Owner" field lets the viewer pick another.
  const defaultCreateOwnership: PreferredResourceOwnership | null =
    preferredResourceOwnershipForList({
      queryType: props.queryType,
      organization_id: props.organization_id,
      platformOrganizationId: ownerOrganizationId,
      ownerTypeFilter: props.ownerTypeFilter,
    });
  const createOwnershipOptions: CreateResourceOwnershipOptions | null =
    defaultCreateOwnership
      ? {
          defaultOwnership: defaultCreateOwnership,
          allowPersonal: props.canCreatePersonal ?? true,
          contextOrganization:
            props.queryType === "org" &&
            props.isOrgOwner &&
            props.organization_id &&
            props.organization_id !== ownerOrganizationId
              ? {
                  organization_id: props.organization_id,
                  organization_name: props.organization_name ?? null,
                }
              : undefined,
        }
      : null;
  const offersCreation: boolean =
    (props.canCreate ?? true) &&
    canManageListedApiServers &&
    !!createOwnershipOptions;
  const { choices: createOwnershipChoices } = useResourceOwnershipChoices(
    createOwnershipOptions ?? {},
    { enabled: offersCreation },
  );
  const canCreateApiServers: boolean =
    offersCreation && hasAvailableResourceOwnership(createOwnershipChoices);
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
                  canCreate={canCreateApiServers}
                />
              </CardContent>
              <CardFooter>
                <div className="flex flex-row items-start justify-start gap-2"></div>
              </CardFooter>
            </Card>
            {canCreateApiServers && createOwnershipOptions && (
              <CreateApiServerDialog
                clearApiServersCache={clearUseApiServersCache}
                ownership={createOwnershipOptions}
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
            {canManageListedApiServers && (
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
