"use client";

import { useContext, type ReactElement } from "react";
import { Datatable, useToast } from "@schemavaults/ui";
import { columns } from "./columns";
import { Loader2 } from "lucide-react";
import type { InviteCodeDefinition } from "@schemavaults/auth-common";
import { CreateInviteCodeDialogTrigger } from "@/components/CreateInviteCodeDialog";
import { useAllInviteCodes } from "./useAllInviteCodes";
import { CreateInviteCodeDialogDispatchContext } from "@/components/CreateInviteCodeDialog";

export interface InviteCodesDatatableProps {
  preloaded?: readonly InviteCodeDefinition[] | undefined;
}

function InviteCodesTableHeaderButtons(): ReactElement {
  const onOpenChange: (val: boolean) => void = useContext(
    CreateInviteCodeDialogDispatchContext,
  );
  return <CreateInviteCodeDialogTrigger onOpenChange={onOpenChange} />;
}

export function InviteCodesTable({
  preloaded,
}: InviteCodesDatatableProps): ReactElement {
  const { toast } = useToast();

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
      HeaderButtons={InviteCodesTableHeaderButtons}
      datatypeLabel="Invite Code"
      searchColumn={["invite_code", "description"]}
    />
  );
}

export default InviteCodesTable;
