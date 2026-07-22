"use client";

import { type ReactElement } from "react";

import { Dialog, DialogContent } from "@schemavaults/ui";
import CreateApiServerDomainForm from "./CreateApiServerDomainForm";

interface CreateApiServerDomainDialogProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  uuid: () => string;
}

/**
 * Thin wrapper following the same pattern as CreateApiServerDialog: the form
 * lives in a child component inside DialogContent, so each dialog open mounts
 * a fresh form initialized with complete default values (no post-open
 * setValue re-render, and a new domain ref id per open).
 */
export function CreateApiServerDomainDialog({
  open,
  onOpenChange,
  uuid,
}: CreateApiServerDomainDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[425px]"
        id="create-api-server-domain-dialog-content"
      >
        <CreateApiServerDomainForm
          uuid={uuid}
          onSuccess={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export default CreateApiServerDomainDialog;
