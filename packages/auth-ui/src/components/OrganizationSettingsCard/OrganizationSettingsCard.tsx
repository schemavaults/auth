"use client";

import { useState, type ReactElement } from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@schemavaults/ui";
import { Trash2 } from "lucide-react";
import { DeleteOrganizationDialog } from "./DeleteOrganizationDialog";
import { type OrganizationID } from "@schemavaults/auth-common";
import { useAuthUiOwnerOrganizationId } from "@/components/OwnerOrganizationProvider";

export interface OrganizationSettingsCardProps {
  organization_id: OrganizationID;
  organization_name: string;
  redirect: (url: string) => Promise<void>;
  cardClassName?: string;
}

export function OrganizationSettingsCard({
  organization_id,
  organization_name,
  redirect,
  cardClassName,
}: OrganizationSettingsCardProps): ReactElement {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const ownerOrganizationId = useAuthUiOwnerOrganizationId();

  return (
    <>
      <Card className={cn("w-full", cardClassName)}>
        <CardHeader>
          <CardTitle>Organization Settings</CardTitle>
          <CardDescription>
            Manage settings for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/** Danger Zone Settings */}
          <div className="border border-destructive rounded-lg p-4">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-semibold text-destructive">
                  Danger Zone
                </h3>
                <p className="text-sm text-muted-foreground">
                  Irreversible and destructive actions.
                </p>
              </div>
              <div className="flex flex-row items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Delete this organization</p>
                  <p className="text-sm text-muted-foreground">
                    Once deleted, this organization and all its data will be
                    permanently removed.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={(e) => {
                    e.preventDefault();
                    setDeleteDialogOpen(true);
                  }}
                  data-testid="open-delete-organization-dialog-button"
                  disabled={organization_id === ownerOrganizationId}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <DeleteOrganizationDialog
        organization_id={organization_id}
        organization_name={organization_name}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        redirect={redirect}
      />
    </>
  );
}

export default OrganizationSettingsCard;
