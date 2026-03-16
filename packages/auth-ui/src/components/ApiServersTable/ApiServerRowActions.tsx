"use client";

import type { ReactElement } from "react";
import { useState, useContext } from "react";
import { isHardcodedApiServerId } from "@schemavaults/app-definitions";
import { cn, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import {
  ClipboardCopy,
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
import {
  SCHEMAVAULTS_AUTH_SERVER,
  type ApiServerId,
  type SchemaVaultsApiServerDefinition,
} from "@schemavaults/app-definitions";
import Link from "next/link";
import { ConnectAppToApiDialog } from "@/components/ConnectAppToApiDialog";
import { DeleteApiServerDialog } from "@/components/DeleteApiServerDialog";
import { ApiServersTableConfigContext } from "./ApiServersTableConfigContext";

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
  const [connectDialogOpen, setConnectDialogOpen] = useState<boolean>(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false);
  const { showConnectAppToApi, isOrgOwner } = useContext(
    ApiServersTableConfigContext,
  );
  const hardcoded = api.hardcoded && isHardcodedApiServerId(api_server_id);
  const isDeleteDisabled = hardcoded || (!showConnectAppToApi && !isOrgOwner);

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
          {api_server_id !== SCHEMAVAULTS_AUTH_SERVER.api_server_id && (
            <Link
              href={`/apis/${api_server_id}/jwks-access-keys`}
              className="hover:cursor-pointer"
            >
              <DropdownMenuItem className={menuItemClassname}>
                <Key className={menuItemIconClassname} /> Manage Access Keys
              </DropdownMenuItem>
            </Link>
          )}
          {showConnectAppToApi && (
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
      {showConnectAppToApi && (
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
