"use client";

import type { ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { columns } from "./columns";
import { Loader2 } from "lucide-react";
import type { UserData } from "@schemavaults/auth-common";

export interface UsersDatatableProps {
  users: SWRResponse<readonly UserData[], Error>;
}

export function UsersTable({ users }: UsersDatatableProps): ReactElement {
  const { isLoading, data } = users;

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
        admin: true,
        email_verified: false,
        disabled: false,
        invite_code: false,
        created_at: true,
      }}
      HeaderButtons={(): ReactElement => {
        return <></>;
      }}
      datatypeLabel="User"
    />
  );
}
