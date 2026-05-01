"use client";

import { useMemo, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { Loader2 } from "lucide-react";
import type { IssuedTokenRow } from "@/lib/auth-db/issued-tokens";
import { createColumns } from "./columns";

export interface UserTokensTableProps {
  tokens: SWRResponse<readonly IssuedTokenRow[], Error>;
  datatypeLabel: string;
}

export function UserTokensTable({
  tokens,
  datatypeLabel,
}: UserTokensTableProps): ReactElement {
  const { isLoading, data, error } = tokens;

  const columns = useMemo(() => createColumns(), []);

  if (!data && isLoading) {
    return (
      <div className="min-h-32 w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-16 w-full flex items-center justify-center text-sm text-destructive">
        Failed to load tokens: {error.message}
      </div>
    );
  }

  return (
    <Datatable<IssuedTokenRow>
      data={data ? [...data] : []}
      columns={columns}
      HeaderButtons={() => <></>}
      initialVisibleColumns={{
        jti: true,
        expires_at: true,
        actions: true,
      }}
      datatypeLabel={datatypeLabel}
      searchColumn="jti"
    />
  );
}

export default UserTokensTable;
