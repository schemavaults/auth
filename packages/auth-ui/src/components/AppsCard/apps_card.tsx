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

export function AppsCard(props: AppsCardProps): ReactElement {
  const friendlyName: string = useAuthUiFriendlyName();
  const ownerOrganizationId: string = useAuthUiOwnerOrganizationId();
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
                  isOrgOwner={props.isOrgOwner}
                />
              </CardContent>
              <CardFooter>
                <div className="flex flex-row items-start justify-start gap-2"></div>
              </CardFooter>
            </Card>
            <>
              {(props.queryType === "all" ||
                (props.queryType === "org" && props.isOrgOwner)) && (
                <CreateAppDialog
                  clearFrontendAppsCache={clearUseAppsListCache}
                  owner_organization_id={
                    props.queryType === "all"
                      ? ownerOrganizationId
                      : props.organization_id
                  }
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
              {(props.queryType === "all" ||
                (props.queryType === "org" && props.isOrgOwner)) && (
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
