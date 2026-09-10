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
import type {
  AppId,
  ListAppsQueryType,
  RequestedResourceOwnership,
} from "@schemavaults/app-definitions";
import { useCurrentUser } from "@schemavaults/auth-react-provider";
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

import { useAuthUiFriendlyName } from "@/components/FriendlyNameProvider";
import { useAuthUiOwnerOrganizationId } from "@/components/OwnerOrganizationProvider";

export interface AppsCardProps {
  cardTitle?: string;
  cardDescription?: string;
  cardClassName?: string;
  queryType: ListAppsQueryType;
  preloaded?: PreloadedAppsTableDataWithDomainRefs;
  organization_id?: string;
  uuid: () => string;
  isOrgOwner?: boolean;
}

/**
 * @description Who an app created from a card of the given query type
 * belongs to: platform-owned from the admin "all" list, organization-owned
 * from an organization page, user-owned from the "owned" (your
 * applications) card. Returns null when the card cannot create apps.
 */
function resolveCreateOwnershipForCard(
  queryType: ListAppsQueryType,
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
      return currentUserUid
        ? { owner_type: "user", owner_uid: currentUserUid }
        : null;
    default:
      return null;
  }
}

export function AppsCard(props: AppsCardProps): ReactElement {
  const friendlyName: string = useAuthUiFriendlyName();
  const ownerOrganizationId: string = useAuthUiOwnerOrganizationId();
  const currentUser = useCurrentUser();
  const createOwnership: RequestedResourceOwnership | null =
    resolveCreateOwnershipForCard(
      props.queryType,
      props.organization_id,
      ownerOrganizationId,
      currentUser?.uid,
    );
  const canCreateApps: boolean =
    !!createOwnership &&
    (props.queryType === "all" ||
      props.queryType === "owned" ||
      (props.queryType === "org" && !!props.isOrgOwner));
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

  return (
    <CreateAppDialogOpenDispatchContext.Provider value={setCreateAppDialogOpen}>
      <AuthorizeClientApplicationDialogOpenDispatchContext.Provider
        value={setAuthorizeAppDialogOpen}
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
                  isOrgOwner={props.isOrgOwner || props.queryType === "owned"}
                />
              </CardContent>
              <CardFooter>
                <div className="flex flex-row items-start justify-start gap-2"></div>
              </CardFooter>
            </Card>
            <>
              {canCreateApps && createOwnership && (
                <CreateAppDialog
                  clearFrontendAppsCache={clearUseAppsListCache}
                  ownership={createOwnership}
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
              {canCreateApps && (
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
      </AuthorizeClientApplicationDialogOpenDispatchContext.Provider>
    </CreateAppDialogOpenDispatchContext.Provider>
  );
}

export default AppsCard;
