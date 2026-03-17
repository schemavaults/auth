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
import { clearUseAppsListCache } from "../AppsTable/useAppsList";
import { useAuth } from "@schemavaults/auth-react-provider";

export interface DeleteAppDialogProps {
  app_id: string;
  app_name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteAppDialog({
  app_id,
  app_name,
  open,
  onOpenChange,
  onDeleted,
}: DeleteAppDialogProps): ReactElement {
  const [confirmationInput, setConfirmationInput] = useState("");
  const [deleting, startDeleting] = useTransition();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const auth = useAuth();

  const isConfirmed = confirmationInput === app_name;

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
        await authClient.deleteClientApplication(app_id);

        toast({
          title: "App deleted",
          description: `The app "${app_name}" has been permanently deleted.`,
        });

        setConfirmationInput("");
        onOpenChange(false);
        clearUseAppsListCache(mutate);
        onDeleted?.();
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to delete app",
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
          <DialogTitle>Delete App</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the
            app and remove all associated data including domains and API connections.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-app-name">
              Type <span className="font-bold">{app_name}</span> to confirm
            </Label>
            <Input
              id="confirm-app-name"
              data-testid="confirm-app-name-input"
              placeholder={app_name}
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
            data-testid="confirm-delete-app-button"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete App
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteAppDialog;
