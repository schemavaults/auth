"use client";

import { useState, type ReactElement } from "react";
import { Datatable, useToast } from "@schemavaults/ui";
import { columns } from "./columns";
import { Loader2 } from "lucide-react";
import type { InviteCodeDefinition } from "@schemavaults/auth-common";
import CreateInviteCodeDialog from "@/components/CreateInviteCodeDialog";
import { useAllInviteCodes } from "./useAllInviteCodes";

export interface InviteCodesDatatableProps {
  preloaded?: readonly InviteCodeDefinition[] | undefined;
}

export function InviteCodesTable({
  preloaded,
}: InviteCodesDatatableProps): ReactElement {
  const { toast } = useToast();
  const [createInviteCodeDialogOpen, setCreateInviteCodeDialogOpen] =
    useState<boolean>(false);
  const invite_codes = useAllInviteCodes({
    toast,
    initialData: preloaded,
  });
  const { isLoading, data } = invite_codes;

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <Datatable<InviteCodeDefinition>
      data={data ? (data.length > 0 ? [...data] : []) : []}
      columns={columns}
      initialVisibleColumns={{
        actions: true,
        select: true,
        invite_code: true,
        description: true,
        max_uses: true,
        created_at: false,
      }}
      HeaderButtons={(): ReactElement => {
        return (
          <>
            <CreateInviteCodeDialog
              open={createInviteCodeDialogOpen}
              onOpenChange={setCreateInviteCodeDialogOpen}
            />
          </>
        );
      }}
      datatypeLabel="Invite Code"
      searchColumn={["invite_code", "description"]}
    />
  );
}

export default InviteCodesTable;
