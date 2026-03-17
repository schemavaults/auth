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
import { Trash2 } from "lucide-react";
import { useSWRConfig } from "swr";
import { clearUseApiServersCache } from "../ApiServersTable/useApiServersList";
import { useAuth } from "@schemavaults/auth-react-provider";

export interface DeleteApiServerDialogProps {
  api_server_id: string;
  api_server_name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteApiServerDialog({
  api_server_id,
  api_server_name,
  open,
  onOpenChange,
  onDeleted,
}: DeleteApiServerDialogProps): ReactElement {
  const [confirmationInput, setConfirmationInput] = useState("");
  const [deleting, startDeleting] = useTransition();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const auth = useAuth();

  const isConfirmed = confirmationInput === api_server_name;

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

  async function handleDelete(): Promise<void> {
    if (!isConfirmed) return;

    startDeleting(async () => {
      try {
        const authClient = auth.ready ? auth.client.current : undefined;
        if (!authClient) {
          throw new Error("Auth client is not available");
        }
        await authClient.deleteApiServer(api_server_id);

        toast({
          title: "API server deleted",
          description: `The API server "${api_server_name}" has been permanently deleted.`,
        });

        setConfirmationInput("");
        onOpenChange(false);
        clearUseApiServersCache(mutate);
        onDeleted?.();
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to delete API server",
          description:
            error instanceof Error ? error.message : "An unknown error occurred",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete API Server</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the
            API server and remove all associated data including domains and access keys.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-api-server-name">
              Type <span className="font-bold">{api_server_name}</span> to
              confirm
            </Label>
            <Input
              id="confirm-api-server-name"
              data-testid="confirm-api-server-name-input"
              placeholder={api_server_name}
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              disabled={deleting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || deleting}
            data-testid="confirm-delete-api-server-button"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete API Server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteApiServerDialog;
