"use client";

import { useState, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { columns } from "./columns";
import { Loader2 } from "lucide-react";

export interface InviteCodesDatatableProps {
  invite_codes: SWRResponse<readonly InviteCodeDefinition[], Error>;
}
import type { InviteCodeDefinition } from "@schemavaults/auth-common";
import CreateInviteCodeDialog from "@/components/CreateInviteCodeDialog";

export function InviteCodesTable({
  invite_codes,
}: InviteCodesDatatableProps): ReactElement {
  const [createInviteCodeDialogOpen, setCreateInviteCodeDialogOpen] =
    useState<boolean>(false);
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
