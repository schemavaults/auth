"use client";

import { Button } from "@schemavaults/ui";
import type { ReactElement } from "react";

import { Dialog, DialogContent } from "@schemavaults/ui";
import { Building2 } from "lucide-react";
import CreateOrganizationForm from "./CreateOrganizationForm";

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
        <CreateOrganizationForm onSuccess={() => onOpenChange(false)} />
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
