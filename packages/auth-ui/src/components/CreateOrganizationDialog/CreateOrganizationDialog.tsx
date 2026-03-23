"use client";

import {
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@schemavaults/ui";
import type { ReactElement } from "react";

import { Dialog, DialogContent } from "@schemavaults/ui";
import { Building2 } from "lucide-react";
import CreateOrganizationForm from "@/components/CreateOrganizationForm";

export interface CreateOrganizationDialogProps {
  open: boolean;
  onOpenChange: (val: boolean) => void;
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
}: CreateOrganizationDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="create-organization-dialog-content"
        className="sm:max-w-[425px]"
      >
        <DialogHeader>
          <DialogTitle>Create a new organization</DialogTitle>
          <DialogDescription>
            Create a new organization to group users and resources together.
          </DialogDescription>
        </DialogHeader>
        <CreateOrganizationForm
          onSuccess={(): void => onOpenChange(false)}
          FooterWrapper={DialogFooter}
        />
      </DialogContent>
    </Dialog>
  );
}

export interface CreateOrganizationDialogTriggerProps {
  onOpenChange: (val: boolean) => void;
}

export function CreateOrganizationDialogTrigger({
  onOpenChange,
}: CreateOrganizationDialogTriggerProps) {
  return (
    <Button
      id="open-create-organization-dialog-button"
      onClick={(e) => {
        e.preventDefault();
        onOpenChange(true);
      }}
    >
      <Building2 className="h-4 w-4 mr-2" /> Create organization
    </Button>
  );
}

export default CreateOrganizationDialog;
