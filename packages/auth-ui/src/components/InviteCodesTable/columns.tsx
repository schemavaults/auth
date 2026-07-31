"use client";

import type { ReactElement } from "react";

import type { ColumnDef } from "@schemavaults/ui";
import { Checkbox, useToast } from "@schemavaults/ui";
import { Button } from "@schemavaults/ui";
import { ClipboardCopy, Hash, Link2, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@schemavaults/ui";
import type { InviteCodeDefinition } from "@schemavaults/auth-common";
import { LocalDateTime } from "@/lib/LocalDateTime";

export const columns: ColumnDef<InviteCodeDefinition>[] = [
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
    id: "invite_code",
    accessorKey: "invite_code",
    header: "Invite Code",
  },
  {
    id: "description",
    accessorKey: "description",
    header: "Description",
  },
  {
    id: "max_uses",
    accessorKey: "max_uses",
    header: "Max Uses",
  },
  {
    id: "created_at",
    accessorKey: "created_at",
    header: "Creation Time",
    cell: ({ row }): ReactElement => {
      const invite_code_definition: InviteCodeDefinition = row.original;
      return <LocalDateTime value={invite_code_definition.created_at} />;
    },
  },
  {
    id: "actions",
    cell: function InviteCodesTableRowActionsCell({ row }): ReactElement {
      const { toast } = useToast();
      const invite_code_definition: InviteCodeDefinition = row.original;

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={async (e): Promise<void> => {
                e.preventDefault();
                const invite_code: string = invite_code_definition.invite_code;
                try {
                  if (!window.isSecureContext) {
                    throw new Error(
                      "Writing to clipboard is only allowed in secure contexts!",
                    );
                  }
                  await navigator.clipboard.writeText(invite_code);
                } catch (e: unknown) {
                  toast({
                    title: "Failed to copy invite code to clipboard!",
                    description:
                      e instanceof Error
                        ? e.message
                        : "An unknown error has occurred!",
                  });
                  return;
                }

                toast({
                  title: "Successfully copied invite code to clipboard!",
                  description: `You should now be able to paste '${invite_code}' from your clipboard!`,
                });
              }}
            >
              <ClipboardCopy className="h-4 w-4 pr-2" /> Copy Invite Code
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async (e): Promise<void> => {
                e.preventDefault();
                const invite_code: string = invite_code_definition.invite_code;
                // The invite codes admin table is only rendered on the auth
                // server itself (it fetches relative /api/admin routes), so
                // the current origin is the auth server's origin.
                const register_link: URL = new URL(
                  "/auth/register",
                  window.location.origin,
                );
                register_link.searchParams.set("invite_code", invite_code);
                try {
                  if (!window.isSecureContext) {
                    throw new Error(
                      "Writing to clipboard is only allowed in secure contexts!",
                    );
                  }
                  await navigator.clipboard.writeText(register_link.toString());
                } catch (e: unknown) {
                  toast({
                    title: "Failed to copy register link to clipboard!",
                    description:
                      e instanceof Error
                        ? e.message
                        : "An unknown error has occurred!",
                  });
                  return;
                }

                toast({
                  title: "Successfully copied register link to clipboard!",
                  description: `Share '${register_link.toString()}' to let someone register with this invite code pre-filled.`,
                });
              }}
            >
              <Link2 className="h-4 w-4 pr-2" /> Copy Register Link
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async (e): Promise<void> => {
                e.preventDefault();
                const invite_code: string = invite_code_definition.invite_code;
                let usage_count: number;
                try {
                  const res = await fetch(
                    `/api/admin/invite-codes/${encodeURIComponent(invite_code)}/usages`,
                    { method: "GET", credentials: "include" },
                  );
                  const body: {
                    success: boolean;
                    message?: string;
                    data?: { invite_code: string; usage_count: number };
                  } = await res.json();
                  if (!res.ok || !body.success || !body.data) {
                    throw new Error(
                      body.message ??
                        `Request failed with status ${res.status}`,
                    );
                  }
                  usage_count = body.data.usage_count;
                } catch (e: unknown) {
                  toast({
                    title: "Failed to count invite code usages!",
                    description:
                      e instanceof Error
                        ? e.message
                        : "An unknown error has occurred!",
                  });
                  return;
                }

                toast({
                  title: "Invite code usage count",
                  description: `'${invite_code}' has been used ${usage_count} time(s).`,
                });
              }}
            >
              <Hash className="h-4 w-4 pr-2" /> Count Uses
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
