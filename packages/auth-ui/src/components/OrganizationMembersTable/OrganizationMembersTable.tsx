"use client";

import type { ReactElement } from "react";
import type { SWRResponse } from "swr";
import { Datatable } from "@schemavaults/ui";
import { columns, type OrganizationMemberTableData } from "./columns";
import { Loader2 } from "lucide-react";
import { InviteMemberDialogTriggerButton } from "@/components/InviteMemberDialog";
import type { OrganizationID } from "@schemavaults/auth-common";
import useSWR from "swr";

export interface OrganizationMembersDatatableProps {
  organization_id: OrganizationID;
  preloaded_members?: readonly OrganizationMemberTableData[];
  showInviteButton?: boolean;
}

export function OrganizationMembersTable({
  organization_id,
  preloaded_members,
  showInviteButton = true,
}: OrganizationMembersDatatableProps): ReactElement {
  const listOrganizationMembersEndpoint = `/api/organizations/${organization_id}/members`;

  const {
    data,
    isLoading,
  }: SWRResponse<readonly OrganizationMemberTableData[]> = useSWR(
    listOrganizationMembersEndpoint,
    async (): Promise<readonly OrganizationMemberTableData[]> => {
      try {
        const response = await fetch(listOrganizationMembersEndpoint, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok || response.status !== 200) {
          throw new Error(
            `Failed to list organization members (response status: ${response.status})!`,
          );
        }
        const body: unknown = await response.json();
        if (
          typeof body !== "object" ||
          !body ||
          !("success" in body) ||
          !body.success
        ) {
          throw new Error(
            "Received failure response when attempting to list organization members",
          );
        }
        if (
          !("data" in body) ||
          typeof body.data !== "object" ||
          !body.data ||
          !("members" in body.data) ||
          !Array.isArray(body.data.members)
        ) {
          throw new Error("Failed to extract 'members' array from response!");
        }

        const members: readonly OrganizationMemberTableData[] = body.data
          .members as OrganizationMemberTableData[];
        return members;
      } catch (e: unknown) {
        console.error(`Failed to list organization members: `, e);
        throw new Error(`Failed to list organization members!`);
      }
    },
    {
      fallbackData: preloaded_members,
    },
  );

  if (!data && isLoading) {
    return (
      <div className="min-h-48 w-full flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin" />
      </div>
    );
  }

  return (
    <Datatable<OrganizationMemberTableData>
      data={data ? (data.length > 0 ? [...data] : []) : []}
      columns={columns}
      initialVisibleColumns={{
        actions: true,
        select: true,
        email: true,
        role: true,
        admin: false,
        email_verified: false,
        membership_created_at: true,
        uid: false,
      }}
      HeaderButtons={showInviteButton ? InviteMemberDialogTriggerButton : undefined}
      datatypeLabel="Member"
      searchColumn={["email"]}
    />
  );
}
