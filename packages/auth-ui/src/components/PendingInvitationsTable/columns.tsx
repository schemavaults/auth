"use client";

import type { ReactElement } from "react";
import type { ColumnDef } from "@schemavaults/ui";
import { Checkbox } from "@schemavaults/ui";
import type { UserPendingInvitation } from "@schemavaults/auth-common";
import { LocalDateTime } from "@/lib/LocalDateTime";
import AcceptDeclineOrgInvitationButtons from "./AcceptDeclineOrgInvitationButtons";

export const columns: ColumnDef<UserPendingInvitation>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value: boolean) =>
          table.toggleAllPageRowsSelected(!!value)
        }
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value: boolean) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "organization_name",
    accessorKey: "organization_name",
    header: "Organization",
  },
  {
    id: "inviter_email",
    accessorKey: "inviter_email",
    header: "Invited By",
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Invited At",
    cell: ({ row }): ReactElement => {
      const invitation: UserPendingInvitation = row.original;
      return (
        <LocalDateTime value={invitation.created_at} showSeconds={false} />
      );
    },
  },
  {
    id: "expires_at",
    accessorKey: "expires_at",
    header: "Expires At",
    cell: ({ row }): ReactElement => {
      const invitation: UserPendingInvitation = row.original;
      return (
        <LocalDateTime value={invitation.expires_at} showSeconds={false} />
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: function PendingInvitationsTableRowActionsCell({
      row,
    }): ReactElement {
      const invitation: UserPendingInvitation = row.original;
      return <AcceptDeclineOrgInvitationButtons invitation={invitation} />;
    },
  },
];
