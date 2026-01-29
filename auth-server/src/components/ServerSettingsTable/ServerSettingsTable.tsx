"use client";

import { useState, useMemo, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { Loader2 } from "lucide-react";
import type { ServerSettingRecord } from "@/lib/auth-db/server-settings/types";
import { createColumns } from "./columns";
import { EditServerSettingDialog } from "./EditServerSettingDialog";

export interface ServerSettingsTableProps {
  settings: SWRResponse<readonly ServerSettingRecord[], Error>;
}

export function ServerSettingsTable({
  settings,
}: ServerSettingsTableProps): ReactElement {
  const [editDialogOpen, setEditDialogOpen] = useState<boolean>(false);
  const [editingSetting, setEditingSetting] =
    useState<ServerSettingRecord | null>(null);

  const { isLoading, data } = settings;

  const columns = useMemo(
    () =>
      createColumns({
        onEditSetting: (setting) => {
          setEditingSetting(setting);
          setEditDialogOpen(true);
        },
      }),
    []
  );

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Datatable<ServerSettingRecord>
        data={data ? [...data] : []}
        columns={columns}
        HeaderButtons={() => <></>}
        initialVisibleColumns={{
          actions: true,
          key: true,
          value: true,
          valueType: true,
          description: true,
          updatedAt: false,
          updatedBy: false,
        }}
        datatypeLabel="Setting"
        searchColumn={["key", "description"]}
      />
      <EditServerSettingDialog
        setting={editingSetting}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
      />
    </>
  );
}

export default ServerSettingsTable;
