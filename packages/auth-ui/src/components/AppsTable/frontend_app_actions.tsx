"use client";

import type {
  SchemaVaultsApp,
  ListAppsQueryType,
  SchemaVaultsAppDomainRef,
  AppId,
} from "@schemavaults/app-definitions";
import {
  type ReactElement,
  useState,
  useTransition,
  useMemo,
  useContext,
} from "react";
import { cn, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import {
  AppWindow,
  ClipboardCopy,
  EarthLock,
  MoreHorizontal,
  PlayCircle,
  PlugZap,
  Trash,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import {
  useAdmin,
  useAppEnvironment,
  useAuth,
} from "@schemavaults/auth-react-provider";
import { sendAuthorizeFrontendAppRequest } from "./send-authorize-app-request";
import { useAppDomains } from "./useAppDomains";
import { launchWebApp } from "./launchWebApp";
import {
  isHardcodedAppId,
  HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS,
} from "@schemavaults/app-definitions";
import { CreateAppDomainDialogOpenDispatchContext } from "@/components/CreateAppDomainDialog";
import { DeleteAppDialog } from "@/components/DeleteAppDialog";

const dropdownMenuActionsClassName: string =
  "hover:cursor-pointer flex flex-row gap-2 items-center justify-start pointer-events-auto" as const;

interface FrontendApplicationActionsProps {
  app: SchemaVaultsApp;
  queryType: ListAppsQueryType;
  isOrgOwner?: boolean;
}

class CantCopyWithinInsecureContextError extends Error {}

export function FrontendApplicationActions({
  app,
  queryType,
  isOrgOwner,
}: FrontendApplicationActionsProps): ReactElement {
  const app_id: AppId = app.app_id;
  const hardcoded: boolean = app.hardcoded && isHardcodedAppId(app_id);
  const { toast } = useToast();
  const [authorizingApp, startAuthorizingApp] = useTransition();
  const authContext = useAuth();

  let preloadedAppDomains: SchemaVaultsAppDomainRef[] | undefined = undefined;
  if (hardcoded) {
    preloadedAppDomains = HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS.filter(
      (a): boolean => a.app_id === app_id,
    );
  }

  const authClient = authContext.ready ? authContext.client.current : undefined;
  const appDomains = useAppDomains({
    app_id: app.app_id,
    initialData: preloadedAppDomains,
    authClient: authClient ?? undefined,
  });

  const admin: boolean = useAdmin();
  const environment = useAppEnvironment();
  const openAddAppDomainDialog = useContext(
    CreateAppDomainDialogOpenDispatchContext,
  );

  const launchableAppDomains: readonly SchemaVaultsAppDomainRef[] =
    useMemo(() => {
      if (!Array.isArray(appDomains.data) || appDomains.data.length === 0) {
        return [];
      }

      const launchable: readonly SchemaVaultsAppDomainRef[] =
        appDomains.data.filter(function filterLaunchableAppDomains(
          domain: SchemaVaultsAppDomainRef,
        ): boolean {
          if (
            domain.environment === "development" &&
            environment === "development"
          ) {
            return true;
          } else if (
            domain.environment === "production" &&
            environment === "production"
          ) {
            return true;
          } else if (domain.environment === "test" && environment === "test") {
            return true;
          } else if (
            domain.environment === "staging" &&
            environment === "staging"
          ) {
            return true;
          }
          return false;
        }); // end of filterLaunchableAppDomains

      if (environment !== "production") {
        console.log("Launchable app domains: ", launchable);
      }

      return launchable;
    }, [appDomains.data, environment]);

  const launchAppDisabled: boolean =
    !Array.isArray(appDomains.data) ||
    appDomains.data.length === 0 ||
    launchableAppDomains.length === 0;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);

  const isDeleteAppDisabled: boolean = hardcoded || (!admin && !isOrgOwner);

  const showAddAppDomain: boolean =
    (admin && queryType === "all") || (!!isOrgOwner && queryType === "org");
  const showConnectApi: boolean = admin && queryType === "all";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            data-testid="app-actions-button"
          >
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          {!launchAppDisabled && (
            <DropdownMenuItem
              className={cn(dropdownMenuActionsClassName)}
              onClick={
                launchAppDisabled
                  ? undefined
                  : (): void => {
                      try {
                        launchWebApp({
                          toast,
                          appDomains: Array.isArray(appDomains.data)
                            ? appDomains.data
                            : [],
                          launchableAppDomains,
                          environment,
                        });
                      } catch (e: unknown) {
                        console.error(e);
                        toast({
                          variant: "destructive",
                          title: "Failed to launch web app",
                        });
                      }
                    }
              } // end of onClick
              disabled={launchAppDisabled}
            >
              <PlayCircle className="h-4 w-4" /> Launch App
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            className={cn(dropdownMenuActionsClassName)}
            onClick={(e) => {
              e.preventDefault();

              if (!window) {
                throw new TypeError(
                  "Failed to load reference to 'window' global variable!",
                );
              }

              try {
                if (!window.isSecureContext) {
                  throw new CantCopyWithinInsecureContextError(
                    "Access to clipboard is only allowed in secure contexts!",
                  );
                }

                const clipboard: Clipboard = window.navigator.clipboard;
                clipboard.writeText(app.app_id);
              } catch (e: unknown) {
                console.error("Failed to copy app ID to clipboard: ", e);
                let errorMessage: string = "An unknown error has occurred.";
                if (e instanceof Error) {
                  errorMessage = e.message;
                }
                toast({
                  variant: "destructive",
                  title: "Failed to copy app ID to clipboard",
                  description: errorMessage,
                });
                return;
              }
              toast({
                variant: "default",
                title: "Successfully copied app ID to clipboard",
                description: `You can now paste '${app.app_id}'`,
              });
              return;
            }}
            data-testid="copy-app-id-menu-item"
          >
            <ClipboardCopy className="h-4 w-4" /> Copy app ID
          </DropdownMenuItem>
          {queryType !== "authorized" && <DropdownMenuSeparator />}
          {queryType !== "authorized" && (
            <DropdownMenuItem
              className={cn(dropdownMenuActionsClassName)}
              onClick={(): void => {
                startAuthorizingApp(async (): Promise<void> => {
                  try {
                    if (
                      !authContext ||
                      !authContext.ready ||
                      !authContext.client.current
                    ) {
                      throw new Error("Auth client is not ready!");
                    }
                    await sendAuthorizeFrontendAppRequest({
                      toast,
                      app_id: app.app_id,
                      auth: authContext.client.current,
                    });
                  } catch (e: unknown) {
                    toast({
                      variant: "destructive",
                      title: "Failed to send authorize frontend app request",
                      description: e instanceof Error ? e.message : undefined,
                    });
                    return;
                  }
                });
              }}
              disabled={authorizingApp}
            >
              <AppWindow className="h-4 w-4" /> Authorize app
            </DropdownMenuItem>
          )}

          {showConnectApi && (
            <DropdownMenuItem
              className={cn(dropdownMenuActionsClassName)}
              onClick={(): void => {
                toast({
                  variant: "default",
                  title: "Not implemented",
                });
              }}
            >
              <PlugZap className="h-4 w-4" /> Connect API
            </DropdownMenuItem>
          )}

          {showAddAppDomain && (
            <DropdownMenuItem
              className={cn(dropdownMenuActionsClassName)}
              onClick={(): void => {
                openAddAppDomainDialog(app.app_id);
                return;
              }}
            >
              <EarthLock className="h-4 w-4" /> Add domain
            </DropdownMenuItem>
          )}

          {!isDeleteAppDisabled && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={cn(dropdownMenuActionsClassName, "text-destructive")}
                onClick={(): void => {
                  setDeleteDialogOpen(true);
                }}
                disabled={isDeleteAppDisabled}
              >
                <Trash className="h-4 w-4" /> Delete app
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {!isDeleteAppDisabled && (
        <DeleteAppDialog
          app_id={app_id}
          app_name={app.app_name}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        />
      )}
    </>
  );
}
