"use client";

import { Button } from "@schemavaults/ui";
import type { ReactElement } from "react";

import { Dialog, DialogContent, DialogTrigger } from "@schemavaults/ui";
import { useSWRConfig } from "swr";
import { SCHEMAVAULTS_ORGANIZATION_ID } from "@schemavaults/auth-common";
import { AppWindow } from "lucide-react";
import CreateAppForm from "./CreateAppForm";

interface CreateFrontendAppDialogProps {
  clearFrontendAppsCache: (
    mutate: ReturnType<typeof useSWRConfig>["mutate"],
  ) => void;
  owner_organization_id?: string | null;
  open: boolean;
  onOpenChange: (val: boolean) => void;
  uuid: () => string;
}

export function CreateAppDialog({
  clearFrontendAppsCache,
  owner_organization_id,
  ...props
}: CreateFrontendAppDialogProps): ReactElement {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogTrigger asChild>
        <Button id="open-create-app-dialog-button">
          <AppWindow className="h-4 w-4 mr-2" /> Create app
        </Button>
      </DialogTrigger>
      <DialogContent
        id="create-app-dialog-content"
        className="sm:max-w-[425px]"
      >
        <CreateAppForm
          owner_organization_id={
            owner_organization_id ?? SCHEMAVAULTS_ORGANIZATION_ID
          }
          clearFrontendAppsCache={clearFrontendAppsCache}
          onSuccess={() => props.onOpenChange(false)}
          uuid={props.uuid}
        />
      </DialogContent>
    </Dialog>
  );
}

export default CreateAppDialog;
