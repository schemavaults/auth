"use client";

import { Button } from "@schemavaults/ui";
import type { ReactElement } from "react";

import { Dialog, DialogContent, DialogTrigger } from "@schemavaults/ui";
import { SwatchBook } from "lucide-react";
import CreateInviteCodeForm from "./CreateInviteCodeForm";

export interface CreateInviteCodeDialogProps {
  open: boolean;
  onOpenChange: (val: boolean) => void;
}

export function CreateInviteCodeDialog({
  open,
  onOpenChange,
}: CreateInviteCodeDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="create-invite-code-dialog-content"
        className="sm:max-w-[425px]"
      >
        <CreateInviteCodeForm onSuccess={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

export interface CreateInviteCodeDialogTriggerProps {
  onOpenChange: (val: boolean) => void;
}

export function CreateInviteCodeDialogTrigger({
  onOpenChange,
}: CreateInviteCodeDialogTriggerProps) {
  return (
    <Button
      id="open-create-invite-code-dialog-button"
      onClick={(e) => {
        e.preventDefault();
        onOpenChange(true);
      }}
    >
      <SwatchBook className="h-4 w-4 mr-2" /> Create Invite Code
    </Button>
  );
}

export default CreateInviteCodeDialog;
