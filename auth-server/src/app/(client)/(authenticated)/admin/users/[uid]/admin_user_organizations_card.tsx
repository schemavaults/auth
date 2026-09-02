"use client";

import type { ReactElement } from "react";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Datatable,
  type ColumnDef,
} from "@schemavaults/ui";
import Link from "next/link";
import { LocalDateTime } from "@schemavaults/auth-ui";

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

export interface AdminUserOrganizationsCardProps {
  memberships: readonly AdminUserOrganizationMembershipRow[] | null;
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
  memberships,
}: AdminUserOrganizationsCardProps): ReactElement {
  return (
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
            HeaderButtons={() => <></>}
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
  );
}

export default AdminUserOrganizationsCard;
