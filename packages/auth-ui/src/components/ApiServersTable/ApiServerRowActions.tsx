"use client";

import type { ReactElement } from "react";
import { useState, useContext } from "react";
import { cn, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import {
  ClipboardCopy,
  EarthLock,
  Eye,
  Key,
  MoreHorizontal,
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
import type {
  ApiServerId,
  SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import Link from "next/link";
import { useAdmin } from "@schemavaults/auth-react-provider";
import { ConnectAppToApiDialog } from "@/components/ConnectAppToApiDialog";
import { DeleteApiServerDialog } from "@/components/DeleteApiServerDialog";
import { CreateApiServerDomainDialogOpenDispatchContext } from "@/components/CreateApiServerDomainDialog";
import { ApiServersTableConfigContext } from "./ApiServersTableConfigContext";
import { useCanManageListedResource } from "@/components/ResourceOwnerLabel/useCanManageListedResource";

const menuItemClassname: string = cn(
  "flex flex-row flex-nowrap gap-2 items-center justify-start",
);
const menuItemIconClassname: string = cn("h-4 w-4");

export interface ApiServerRowActionsProps {
  api: SchemaVaultsApiServerDefinition;
}

export function ApiServerRowActions({
  api,
}: ApiServerRowActionsProps): ReactElement {
  const api_server_id: ApiServerId = api.api_server_id;
  const { toast } = useToast();
  const admin: boolean = useAdmin();
  const [connectDialogOpen, setConnectDialogOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const { showConnectAppToApi, isOrgOwner, queryType, managedOrganizationIds } =
    useContext(ApiServersTableConfigContext);
  const openAddApiServerDomainDialog = useContext(
    CreateApiServerDomainDialogOpenDispatchContext,
  );
  // The row's own 'hardcoded' flag identifies the auth server's built-in API
  // definition; comparing ids against a client-bundled constant would be
  // blind to the env-var-driven app id in white-label deployments.
  // Whether the viewer may manage this particular API server: global
  // admins, an organization owner/admin on an org page, the owning user of
  // a user-owned API server, or (on the "accessible" list) an owner/admin
  // of the owning organization. The server enforces every action.
  const canManageApi: boolean = useCanManageListedResource({
    resource: api,
    queryType,
    isOrgOwner,
    managedOrganizationIds,
  });
  const isDeleteDisabled = api.hardcoded || !canManageApi;

  // Hardcoded API servers have no database row for a domain to reference;
  // their domains come from the server's environment configuration.
  const showAddDomain: boolean = !api.hardcoded && canManageApi;
  // Connecting an app requires owning the API server too, so only offer it
  // on rows the viewer manages (or wherever the card asked for it, e.g. the
  // admin list).
  const showConnectForRow: boolean =
    showConnectAppToApi && (admin || canManageApi);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            data-testid="api-server-actions-button"
          >
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem asChild className={menuItemClassname}>
            <Link href={`/apis/${api_server_id}`}>
              <Eye className={menuItemIconClassname} /> View API details
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={async (e) => {
              e.preventDefault();
              try {
                if (!window.isSecureContext) {
                  throw new Error(
                    "Writing to clipboard is only allowed in secure contexts!",
                  );
                }
                await navigator.clipboard.writeText(api_server_id);
              } catch (e: unknown) {
                toast({
                  variant: "destructive",
                  title: "Failed to copy API server ID to clipboard",
                  description:
                    e instanceof Error
                      ? e.message
                      : "An unknown error has occurred!",
                });
                return;
              }

              toast({
                title: "Successfully copied API server ID to clipboard",
                description: `You can now paste: '${api_server_id}'`,
              });
              return;
            }}
            className={menuItemClassname}
          >
            <ClipboardCopy className={menuItemIconClassname} /> Copy API Server
            ID
          </DropdownMenuItem>
          {!api.hardcoded && (
            <Link
              href={`/apis/${api_server_id}/jwks-access-keys`}
              className="hover:cursor-pointer"
            >
              <DropdownMenuItem className={menuItemClassname}>
                <Key className={menuItemIconClassname} /> Manage Access Keys
              </DropdownMenuItem>
            </Link>
          )}
          {showConnectForRow && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setConnectDialogOpen(true);
                }}
                className={menuItemClassname}
              >
                <PlugZap className={menuItemIconClassname} /> Connect App to
                this API
              </DropdownMenuItem>
            </>
          )}
          {showAddDomain && (
            <DropdownMenuItem
              onClick={(): void => {
                openAddApiServerDomainDialog(api_server_id);
                return;
              }}
              className={menuItemClassname}
            >
              <EarthLock className={menuItemIconClassname} /> Add domain
            </DropdownMenuItem>
          )}
          {!isDeleteDisabled && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setDeleteDialogOpen(true);
                }}
                className={cn(menuItemClassname, "text-destructive")}
              >
                <Trash className={menuItemIconClassname} /> Delete API Server
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {showConnectForRow && (
        <ConnectAppToApiDialog
          open={connectDialogOpen}
          onOpenChange={setConnectDialogOpen}
          preselectedApiServerId={api_server_id}
        />
      )}
      {!isDeleteDisabled && (
        <DeleteApiServerDialog
          api_server_id={api_server_id}
          api_server_name={api.api_server_name}
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        />
      )}
    </>
  );
}
