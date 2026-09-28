"use client";

import { useState, type ReactElement } from "react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Datatable,
  useToast,
  type ColumnDef,
} from "@schemavaults/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AssignOrganizationMemberDialog,
  AssignOrganizationMemberDialogDispatchContext,
  AssignOrganizationMemberDialogTriggerButton,
  LocalDateTime,
  type AssignOrganizationMemberDialogOrganizationOption,
} from "@schemavaults/auth-ui";
import type { AssignMemberSubmitData, UserData } from "@schemavaults/auth-common";

export interface AdminUserOrganizationMembershipRow {
  membership_declaration_id: string;
  organization_id: string;
  organization_name: string;
  role: string;
  membership_created_at: number;
  /**
   * True for the implicit owner-organization membership derived from the
   * user's server admin flag rather than a database membership row.
   */
  virtual: boolean;
}

/** An organization the user can be added to directly. */
export type AdminUserAssignableOrganization =
  AssignOrganizationMemberDialogOrganizationOption;

export interface AdminUserOrganizationsCardProps {
  user: UserData;
  memberships: readonly AdminUserOrganizationMembershipRow[] | null;
  /**
   * Organizations the user can be added to; null hides the "Add to
   * Organization" action.
   */
  assignableOrganizations: readonly AdminUserAssignableOrganization[] | null;
}

function AddToOrganizationButton(): ReactElement {
  return (
    <AssignOrganizationMemberDialogTriggerButton triggerButtonLabel="Add to Organization" />
  );
}

const columns: ColumnDef<AdminUserOrganizationMembershipRow>[] = [
  {
    id: "organization_name",
    accessorKey: "organization_name",
    header: "Organization",
    cell: ({ row }): ReactElement => {
      const membership = row.original;
      return (
        <Link
          href={`/orgs/${membership.organization_id}`}
          className="hover:underline text-primary"
          data-testid={`admin-user-org-link-${membership.organization_id}`}
        >
          {membership.organization_name}
        </Link>
      );
    },
  },
  {
    id: "organization_id",
    accessorKey: "organization_id",
    header: "Organization ID",
    cell: ({ row }): ReactElement => {
      const membership = row.original;
      return (
        <Link
          href={`/orgs/${membership.organization_id}`}
          className="hover:underline text-primary"
        >
          {membership.organization_id}
        </Link>
      );
    },
  },
  {
    id: "role",
    accessorKey: "role",
    header: "Role",
    cell: ({ row }): ReactElement => {
      const membership = row.original;
      return (
        <span className="inline-flex items-center gap-2">
          <span className="capitalize">{membership.role}</span>
          {membership.virtual ? (
            <Badge
              variant="secondary"
              title="Implicit membership derived from this user's server admin status"
            >
              Virtual
            </Badge>
          ) : null}
        </span>
      );
    },
  },
  {
    id: "membership_created_at",
    accessorKey: "membership_created_at",
    header: "Member Since",
    cell: ({ row }): ReactElement => {
      const membership = row.original;
      return <LocalDateTime value={membership.membership_created_at} />;
    },
  },
];

export function AdminUserOrganizationsCard({
  user,
  memberships,
  assignableOrganizations,
}: AdminUserOrganizationsCardProps): ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const [assignDialogOpen, setAssignDialogOpen] = useState<boolean>(false);
  const canAssign: boolean = assignableOrganizations !== null;

  // Errors are thrown so the dialog stays open and shows them.
  async function addToOrganization(data: AssignMemberSubmitData): Promise<void> {
    const response = await fetch(
      `/api/organizations/${data.organization_id}/members`,
      {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input_mode: "uid",
          identifier: user.uid,
          role: data.role,
        }),
      },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.success) {
      throw new Error(
        body.message ?? `Failed to add to organization (response status: ${response.status})`,
      );
    }
    toast({
      title: "Added to organization",
      description: body.message ?? `${user.email} is now a member of the organization.`,
    });
    // Reload the server-rendered memberships and assignable organizations
    router.refresh();
  }

  return (
    <AssignOrganizationMemberDialogDispatchContext.Provider value={setAssignDialogOpen}>
      <Card className="w-full" data-testid="admin-user-organizations-card">
        <CardHeader>
          <CardTitle>Organizations</CardTitle>
          <CardDescription>
            Organizations this user is a member of, and their role in each.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {memberships === null ? (
            <div className="min-h-16 w-full flex items-center justify-center text-sm text-destructive">
              Failed to load this user&apos;s organization memberships.
            </div>
          ) : (
            <Datatable<AdminUserOrganizationMembershipRow>
              data={[...memberships]}
              columns={columns}
              HeaderButtons={canAssign ? AddToOrganizationButton : () => <></>}
              initialVisibleColumns={{
                organization_name: true,
                organization_id: true,
                role: true,
                membership_created_at: true,
              }}
              datatypeLabel="Organization Membership"
              searchColumn={["organization_id", "organization_name"]}
            />
          )}
        </CardContent>
      </Card>
      {canAssign && (
        <AssignOrganizationMemberDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          user={{ uid: user.uid, email: user.email }}
          organizations={assignableOrganizations ?? []}
          onSubmit={addToOrganization}
        />
      )}
    </AssignOrganizationMemberDialogDispatchContext.Provider>
  );
}

export default AdminUserOrganizationsCard;
