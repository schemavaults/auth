"use client";

import { Button } from "@schemavaults/ui";
import { useContext, type ReactElement } from "react";

import { Dialog, DialogContent } from "@schemavaults/ui";
import { useSWRConfig } from "swr";
import { AppWindow } from "lucide-react";
import type { CreateResourceOwnershipOptions } from "@/components/ResourceOwnershipPicker";
import CreateAppForm from "./CreateAppForm";
import CreateAppDialogOpenDispatchContext from "./CreateAppDialogOpenDispatchContext";

interface CreateFrontendAppDialogProps {
  clearFrontendAppsCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
  /**
   * Which owners the dialog's "Owner" field offers (the platform for
   * admins, organizations the user administers, the user's own account)
   * and which one it preselects.
   */
  ownership: CreateResourceOwnershipOptions;
  open: boolean;
  onOpenChange: (val: boolean) => void;
  uuid: () => string;
}

export function CreateAppDialog({
  clearFrontendAppsCache,
  ownership,
  ...props
}: CreateFrontendAppDialogProps): ReactElement {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        id="create-app-dialog-content"
        className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto"
      >
        <CreateAppForm
          ownership={ownership}
          clearFrontendAppsCache={clearFrontendAppsCache}
          onSuccess={() => props.onOpenChange(false)}
          uuid={props.uuid}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CreateAppDialogTrigger(): ReactElement {
  const onOpenChange: (open: boolean) => void = useContext(
    CreateAppDialogOpenDispatchContext,
  );

  return (
    <Button
      id="open-create-app-dialog-button"
      onClick={(e) => {
        e.preventDefault();
        onOpenChange(true);
      }}
    >
      <AppWindow className="h-4 w-4 mr-2" /> Create app
    </Button>
  );
}

export default CreateAppDialog;
