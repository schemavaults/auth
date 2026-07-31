"use client";

import { useMemo, type ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable, type ColumnDef } from "@schemavaults/ui";
import { buildColumns } from "./columns";
import { Loader2 } from "lucide-react";
import type { UserData } from "@schemavaults/auth-common";

export interface UsersDatatableProps {
  users: SWRResponse<readonly UserData[], Error>;
  getUserHref?: (user: UserData) => string;
}

export function UsersTable({
  users,
  getUserHref,
}: UsersDatatableProps): ReactElement {
  const { isLoading, data } = users;

  const columns: ColumnDef<UserData>[] = useMemo(
    () => buildColumns({ getUserHref }),
    [getUserHref],
  );

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <Datatable<UserData>
      data={data ? (data.length > 0 ? [...data] : []) : []}
      columns={columns}
      initialVisibleColumns={{
        actions: true,
        select: true,
        email: true,
        uid: false,
        admin: true,
        mfa_factors: true,
        email_verified: false,
        disabled: false,
        invite_code: false,
        created_at: true,
      }}
      HeaderButtons={(): ReactElement => {
        return <></>;
      }}
      datatypeLabel="User"
      searchColumn={['email', 'invite_code']}
    />
  );
}
