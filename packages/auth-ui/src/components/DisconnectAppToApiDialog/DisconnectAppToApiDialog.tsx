"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  useToast,
} from "@schemavaults/ui";
import { type ReactElement, useState, useTransition } from "react";
import { Unplug } from "lucide-react";
import { useAuth } from "@schemavaults/auth-react-provider";

export type DisconnectAppToApiConfirmationTarget = "app" | "api_server";

export interface DisconnectAppToApiDialogProps {
  api_server_id: string;
  api_server_name: string;
  client_app_id: string;
  client_app_name: string;
  /**
   * Which name the user must type to confirm. Use "app" on the API server
   * detail page (where each row represents the app being revoked) and
   * "api_server" on the app detail page.
   */
  confirmation_target: DisconnectAppToApiConfirmationTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDisconnected?: () => void;
}

export function DisconnectAppToApiDialog({
  api_server_id,
  api_server_name,
  client_app_id,
  client_app_name,
  confirmation_target,
  open,
  onOpenChange,
  onDisconnected,
}: DisconnectAppToApiDialogProps): ReactElement {
  const [confirmationInput, setConfirmationInput] = useState("");
  const [disconnecting, startDisconnecting] = useTransition();
  const { toast } = useToast();
  const auth = useAuth();

  const expectedName =
    confirmation_target === "app" ? client_app_name : api_server_name;
  const targetLabel =
    confirmation_target === "app" ? "app" : "API server";
  const isConfirmed = confirmationInput === expectedName;

  function handleCancel(): void {
    setConfirmationInput("");
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      setConfirmationInput("");
    }
    onOpenChange(nextOpen);
  }

  async function handleDisconnect(): Promise<void> {
    if (!isConfirmed) return;

    startDisconnecting(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        await authClient.disconnectAppFromApiServer(
          api_server_id,
          client_app_id,
        );

        toast({
          title: "Connection revoked",
          description: `"${client_app_name}" can no longer request tokens for "${api_server_name}".`,
        });

        setConfirmationInput("");
        onOpenChange(false);
        onDisconnected?.();
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to disconnect",
          description:
            error instanceof Error
              ? error.message
              : "An unknown error occurred",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Disconnect app from API server</DialogTitle>
          <DialogDescription>
            This will revoke{" "}
            <span className="font-medium">{client_app_name}</span>&apos;s access
            to <span className="font-medium">{api_server_name}</span>. The
            connection can be re-established later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-disconnect-name">
              Type the {targetLabel} name{" "}
              <span className="font-bold">{expectedName}</span> to confirm
            </Label>
            <Input
              id="confirm-disconnect-name"
              data-testid="confirm-disconnect-name-input"
              placeholder={expectedName}
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              disabled={disconnecting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={disconnecting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDisconnect}
            disabled={!isConfirmed || disconnecting}
            data-testid="confirm-disconnect-button"
          >
            <Unplug className="h-4 w-4 mr-2" />
            Disconnect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DisconnectAppToApiDialog;
