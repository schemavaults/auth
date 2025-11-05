"use client";

import type { SchemaVaultsApp, ListAppsQueryType, SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";
import { type ReactElement, useTransition, useState, useMemo } from "react";
import { cn, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { AppWindow, ClipboardCopy, EarthLock, MoreHorizontal, PlayCircle, PlugZap, Trash } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@schemavaults/ui";
import { useAdmin, useAppEnvironment, useAuth } from "@schemavaults/auth-react-provider";
import { sendAuthorizeFrontendAppRequest } from "./send-authorize-app-request";
import { getUseAppDomainsListEndpoint, useAppDomains } from "./useAppDomains";
import { CreateAppDomainDialog } from "../CreateAppDomainDialog";
import { launchWebApp } from "./launchWebApp";
import { isHardcodedAppId, HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS } from "@schemavaults/app-definitions";

const dropdownMenuActionsClassName: string = "hover:cursor-pointer flex flex-row gap-2 items-center justify-start pointer-events-auto" as const;

interface FrontendApplicationActionsProps {
  app: SchemaVaultsApp;
  queryType: ListAppsQueryType;
}

export function FrontendApplicationActions(
  { app, queryType }: FrontendApplicationActionsProps
): ReactElement {
  const app_id: string = app.app_id;
  const hardcoded: boolean = app.hardcoded && isHardcodedAppId(app_id);
  const {toast} = useToast();
  const auth = useAuth();
  const [authorizingApp, startAuthorizingApp] = useTransition();

  let preloadedAppDomains: SchemaVaultsAppDomainRef[] | undefined = undefined;
  if (hardcoded) {
    preloadedAppDomains = HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS.filter(
      (a): boolean => (a.app_id === app_id)
    )
  }

  const appDomains = useAppDomains({
    app_id: app.app_id,
    initialData: preloadedAppDomains
  });

  const admin: boolean = useAdmin();
  const environment = useAppEnvironment();

  const launchableAppDomains: readonly SchemaVaultsAppDomainRef[] = useMemo(() => {
    if (!Array.isArray(appDomains.data) || appDomains.data.length === 0) {
      return []
    }

    const launchable: readonly SchemaVaultsAppDomainRef[] = appDomains.data.filter(function filterLaunchableAppDomains(domain: SchemaVaultsAppDomainRef): boolean {
      if (domain.environment === 'development' && environment === 'development') {
        return true;
      } else if (domain.environment === 'production' && environment === 'production') {
        return true;
      } else if (domain.environment === 'test' && environment === 'test') {
        return true;
      } else if (domain.environment === 'staging' && environment === 'staging') {
        return true;
      }
      return false;
    }); // end of filterLaunchableAppDomains

    if (environment !== 'production') {
      console.log("Launchable app domains: ", launchable);
    }

    return launchable;
  }, [appDomains.data])

  const launchAppDisabled: boolean = (
    !Array.isArray(appDomains.data) ||
    appDomains.data.length === 0 ||
    launchableAppDomains.length === 0
  );

  const [isAddWebDomainDialogOpen, setAddWebDomainDialogOpen] = useState<boolean>(false);

  const isDeleteAppDisabled: boolean = hardcoded || !admin;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {!launchAppDisabled && (
            <DropdownMenuItem
              className={cn(dropdownMenuActionsClassName)}
              onClick={launchAppDisabled ? undefined : (): void => {
                try {
                  launchWebApp({
                    toast,
                    appDomains: Array.isArray(appDomains.data) ? appDomains.data : [],
                    launchableAppDomains,
                    environment
                  });
                } catch (e: unknown) {
                  console.error(e);
                  toast({ variant: 'destructive', title: "Failed to launch web app" });
                }
              }} // end of onClick
              disabled={launchAppDisabled}
            >
              <PlayCircle className="h-4 w-4" /> Launch App
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            className={cn(dropdownMenuActionsClassName)}
            onClick={() => {
              try {
                navigator.clipboard.writeText(app.app_id)
                toast({
                  variant: 'default',
                  title: "Copied app ID to clipboard"
                })
              } catch (e: unknown) {
                console.error(e);
                toast({
                  variant: 'destructive',
                  title: "Failed to copy to clipboard"
                });
                return;
              }
            }}
          >
            <ClipboardCopy className="h-4 w-4" /> Copy app ID
          </DropdownMenuItem>
          {
            queryType !== 'authorized' && (
              <DropdownMenuSeparator />
            )
          }
          {
            queryType !== 'authorized' && (
              <DropdownMenuItem
                className={cn(dropdownMenuActionsClassName)}
                onClick={(): void => {
                  startAuthorizingApp(async (): Promise<void> => {
                    try {
                      await sendAuthorizeFrontendAppRequest({
                        auth,
                        toast,
                        app_id: app.app_id
                      });
                    } catch (e: unknown) {
                      toast({
                        variant: 'destructive',
                        title: "Failed to send authorize frontend app request",
                        description: e instanceof Error ? e.message : undefined
                      });
                      return;
                    }
                  })
                }}
                disabled={authorizingApp}
              >
                <AppWindow className="h-4 w-4" /> Authorize app
              </DropdownMenuItem>
            )
          }

          { // Admin 'all apps' view actions
            admin && queryType === 'all' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={cn(dropdownMenuActionsClassName)}
                  onClick={(): void => {
                    toast({
                      variant: 'default',
                      title: "Not implemented"
                    });
                  }}
                >
                  <PlugZap className="h-4 w-4"/> Connect API
                </DropdownMenuItem>
                <DropdownMenuItem
                  className={cn(dropdownMenuActionsClassName)}
                  onClick={(): void => {
                    setAddWebDomainDialogOpen(true);
                  }}
                >
                  <EarthLock className="h-4 w-4"/> Add domain
                </DropdownMenuItem>
              </>
            )
          }

          {
            (!isDeleteAppDisabled) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={cn(dropdownMenuActionsClassName)}
                  onClick={(): void => {
                    toast({
                      variant: 'default',
                      title: "Not implemented"
                    });
                  }}
                  disabled={isDeleteAppDisabled}
                >
                  <Trash className="h-4 w-4"/> Delete app
                </DropdownMenuItem>
              </>

            )
          }
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateAppDomainDialog
        app_id={app.app_id}
        open={isAddWebDomainDialogOpen}
        onOpenChange={setAddWebDomainDialogOpen}
        clearFrontendWebAppDomainsCache={(mutate) => {
          mutate(
            key => key === getUseAppDomainsListEndpoint(app.app_id),
            undefined,
            { revalidate: true }
          );
        }}
        key={`create-domain-dialog-${app.app_id}` as const}
      />
    </>
  )
}
