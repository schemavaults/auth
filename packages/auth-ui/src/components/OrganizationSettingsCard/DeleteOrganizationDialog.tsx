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

export interface DeleteOrganizationDialogProps {
  organization_id: string;
  organization_name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirect: (url: string) => Promise<void>;
}

export function DeleteOrganizationDialog({
  organization_id,
  organization_name,
  open,
  onOpenChange,
  redirect,
}: DeleteOrganizationDialogProps): ReactElement {
  const [confirmationInput, setConfirmationInput] = useState("");
  const [deleting, startDeleting] = useTransition();
  const { toast } = useToast();

  const isConfirmed = confirmationInput === organization_name;

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
        const response = await fetch(`/api/organizations/${organization_id}`, {
          method: "DELETE",
          credentials: "include",
        });

        const body = await response.json();

        if (!response.ok || !body.success) {
          throw new Error(body.message || "Failed to delete organization");
        }

        toast({
          title: "Organization deleted",
          description: `The organization "${organization_name}" has been permanently deleted.`,
        });

        setConfirmationInput("");
        onOpenChange(false);
        await redirect("/account");
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Failed to delete organization",
          description:
            error instanceof Error ? error.message : "An unknown error occurred",
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        id="delete-organization-dialog-content"
        data-testid="delete-organization-dialog-content"
        className="sm:max-w-[425px]"
      >
        <DialogHeader>
          <DialogTitle>Delete Organization</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete the
            organization and remove all associated data.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm-organization-name">
              Type <span className="font-bold">{organization_name}</span> to
              confirm
            </Label>
            <Input
              id="confirm-organization-name"
              data-testid="confirm-organization-name-input"
              placeholder={organization_name}
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
            data-testid="cancel-delete-organization-button"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || deleting}
            data-testid="confirm-delete-organization-button"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Organization
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DeleteOrganizationDialog;
