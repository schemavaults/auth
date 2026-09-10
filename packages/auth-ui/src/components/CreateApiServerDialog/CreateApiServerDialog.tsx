"use client";

import { Button } from "@schemavaults/ui";
import { type ReactElement } from "react";

import { Dialog, DialogContent } from "@schemavaults/ui";
import { useSWRConfig } from "swr";
import { Server } from "lucide-react";
import CreateApiServerForm from "./CreateApiServerForm";
import type { RequestedResourceOwnership } from "@schemavaults/app-definitions";

interface CreateApiServerDialogProps {
  clearApiServersCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
  /**
   * Who the new API server will belong to: the platform (admins only), an
   * organization the user administers, or the user's own account.
   */
  ownership: RequestedResourceOwnership;
  open: boolean;
  onOpenChange: (val: boolean) => void;
  uuid: () => string;
}

export function CreateApiServerDialog({
  clearApiServersCache,
  ownership,
  open,
  onOpenChange,
  uuid,
}: CreateApiServerDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        id="create-api-server-dialog-content"
        className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto"
      >
        <CreateApiServerForm
          clearApiServersCache={clearApiServersCache}
          ownership={ownership}
          onSuccess={() => onOpenChange(false)}
          uuid={uuid}
        />
      </DialogContent>
    </Dialog>
  );
}

interface CreateApiServerDialogTriggerProps {
  onOpenChange: (val: boolean) => void;
}
export function CreateApiServerDialogTrigger({
  onOpenChange,
}: CreateApiServerDialogTriggerProps): ReactElement {
  return (
    <Button
      id="open-create-api-server-dialog-button"
      onClick={(e) => {
        e.preventDefault();
        onOpenChange(true);
      }}
    >
      <Server className="h-4 w-4 mr-2" /> Create API
    </Button>
  );
}

export default CreateApiServerDialog;
