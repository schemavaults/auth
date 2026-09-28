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
import type { AppId, ListAppsQueryType } from "@schemavaults/app-definitions";
import type { OwnerTypeFilterValue } from "@/components/OwnerTypeFilter";
import {
  hasAvailableResourceOwnership,
  preferredResourceOwnershipForList,
  useResourceOwnershipChoices,
  type CreateResourceOwnershipOptions,
  type PreferredResourceOwnership,
} from "@/components/ResourceOwnershipPicker";
import CreateAppDialog, {
  CreateAppDialogOpenDispatchContext,
} from "@/components/CreateAppDialog";
import CreateAppDomainDialog, {
  CreateAppDomainDialogOpenContext,
  CreateAppDomainDialogOpenDispatchContext,
} from "@/components/CreateAppDomainDialog";
import AuthorizeClientApplicationDialog, {
  AuthorizeClientApplicationDialogOpenDispatchContext,
} from "@/components/AuthorizeClientApplicationDialog";
import ConnectAppToApiDialog, {
  ConnectAppToApiDialogOpenDispatchContext,
} from "@/components/ConnectAppToApiDialog";

import { useAuthUiFriendlyName } from "@/components/FriendlyNameProvider";
import { useAuthUiOwnerOrganizationId } from "@/components/OwnerOrganizationProvider";

export interface AppsCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  queryType: ListAppsQueryType;
  preloaded?: PreloadedAppsTableDataWithDomainRefs;
  organization_id?: string;
  /**
   * Display name of `organization_id` (organization pages), shown in the
   * create dialog's organization picker.
   */
  organization_name?: string;
  uuid: () => string;
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
   * Whether the card offers app creation at all (default true). The
   * "Create app" button is also hidden while the viewer cannot pick any
   * owner in the create dialog.
   */
  canCreate?: boolean;
  /**
   * Whether the create dialog offers personal (user-owned) apps: false when
   * the `allow_user_owned_resource_creation` server setting is disabled for
   * a non-admin viewer (default true; the server enforces it regardless).
   */
  canCreatePersonal?: boolean;
}

export function AppsCard(props: AppsCardProps): ReactElement {
  const friendlyName: string = useAuthUiFriendlyName();
  const ownerOrganizationId: string = useAuthUiOwnerOrganizationId();
  // Lists whose rows the viewer may manage (add domains) and to which they
  // may add apps.
  const canManageListedApps: boolean =
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
    canManageListedApps &&
    !!createOwnershipOptions;
  const { choices: createOwnershipChoices } = useResourceOwnershipChoices(
    createOwnershipOptions ?? {},
    { enabled: offersCreation },
  );
  const canCreateApps: boolean =
    offersCreation && hasAvailableResourceOwnership(createOwnershipChoices);
  const cardTitle = props.cardTitle ?? "Applications";
  const cardDescription =
    props.cardDescription ??
    `View and manage which applications are allowed to access ${friendlyName} APIs on your behalf.`;

  const cardClassName: string = cn("w-full", props.cardClassName);
  const [createAppDialogOpen, setCreateAppDialogOpen] =
    useState<boolean>(false);
  const [isAddAppDomainDialogOpen, setAddAppDomainDialogOpen] = useState<
    AppId | false
  >(false);
  const [authorizeAppDialogOpen, setAuthorizeAppDialogOpen] =
    useState<boolean>(false);
  const [connectAppToApiDialogOpen, setConnectAppToApiDialogOpen] =
    useState<boolean>(false);

  return (
    <CreateAppDialogOpenDispatchContext.Provider value={setCreateAppDialogOpen}>
      <AuthorizeClientApplicationDialogOpenDispatchContext.Provider
        value={setAuthorizeAppDialogOpen}
      >
        <ConnectAppToApiDialogOpenDispatchContext.Provider
          value={setConnectAppToApiDialogOpen}
        >
          <CreateAppDomainDialogOpenDispatchContext.Provider
            value={setAddAppDomainDialogOpen}
          >
            <CreateAppDomainDialogOpenContext.Provider
              value={isAddAppDomainDialogOpen}
            >
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
                    isOrgOwner={props.isOrgOwner}
                    managedOrganizationIds={props.managedOrganizationIds}
                    ownerTypeFilter={props.ownerTypeFilter}
                    canCreate={canCreateApps}
                  />
                </CardContent>
                <CardFooter>
                  <div className="flex flex-row items-start justify-start gap-2"></div>
                </CardFooter>
              </Card>
              <>
                {canCreateApps && createOwnershipOptions && (
                  <CreateAppDialog
                    clearFrontendAppsCache={clearUseAppsListCache}
                    ownership={createOwnershipOptions}
                    open={createAppDialogOpen}
                    onOpenChange={setCreateAppDialogOpen}
                    uuid={props.uuid}
                  />
                )}
                {props.queryType === "authorized" && (
                  <AuthorizeClientApplicationDialog
                    open={authorizeAppDialogOpen}
                    onOpenChange={setAuthorizeAppDialogOpen}
                  />
                )}
                {props.queryType === "all" && (
                  <ConnectAppToApiDialog
                    open={connectAppToApiDialogOpen}
                    onOpenChange={setConnectAppToApiDialogOpen}
                  />
                )}
                {canManageListedApps && (
                  <CreateAppDomainDialog
                    open={typeof isAddAppDomainDialogOpen === "string"}
                    onOpenChange={(val: boolean): void => {
                      if (!val) {
                        setAddAppDomainDialogOpen(false);
                      }
                    }}
                    uuid={props.uuid}
                  />
                )}
              </>
            </CreateAppDomainDialogOpenContext.Provider>
          </CreateAppDomainDialogOpenDispatchContext.Provider>
        </ConnectAppToApiDialogOpenDispatchContext.Provider>
      </AuthorizeClientApplicationDialogOpenDispatchContext.Provider>
    </CreateAppDialogOpenDispatchContext.Provider>
  );
}

export default AppsCard;
