// app-service-account-organization-roles.ts
//
// Organization membership for the service account of an
// organization-owned client application (migration 00043). Service
// accounts cannot accept invitations and are refused by direct member
// assignment, so the app's managers opt the service account into the
// organization that owns the app instead. The membership is VIRTUAL:
// `listUserOrganizationMemberships` adds it (like the platform admins'
// virtual membership of the owner organization) from the row stored here
// and the app's CURRENT owner, so it applies only while the app is owned
// by an organization and always names that organization.

import "server-only";
import {
  appIdSchema,
  isHardcodedAppId,
  type AppId,
} from "@schemavaults/app-definitions";
import {
  assignableOrganizationMembershipRoles,
  organizationIdSchema,
  type AssignableOrganizationMembershipRole,
  type OrganizationID,
} from "@schemavaults/auth-common";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import type { AppServiceAccountOrganizationRole } from "./app-service-account-organization-roles-table";

function parseTimestampColumn(value: unknown, column: string): number {
  const parsed: number =
    typeof value === "string" ? parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `Failed to parse ${column} from app_service_account_organization_roles row`,
    );
  }
  return parsed;
}

function isAssignableRole(
  role: unknown,
): role is AssignableOrganizationMembershipRole {
  return (
    typeof role === "string" &&
    (assignableOrganizationMembershipRoles as readonly string[]).includes(role)
  );
}

async function assertConfigurableAppId(app_id: AppId): Promise<void> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid app ID for a service account organization role!");
  }
  if (isHardcodedAppId(app_id)) {
    throw new Error("Hardcoded apps cannot have service accounts");
  }
}

/**
 * The organization role configured for the app's service account, or
 * null when its service account is not opted into the owning
 * organization. Whether it applies depends on the app being
 * organization-owned (see `getServiceAccountVirtualOrganizationMembership`).
 */
export async function getAppServiceAccountOrganizationRole(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
): Promise<AppServiceAccountOrganizationRole | null> {
  await assertConfigurableAppId(app_id);
  const row = await db
    .selectFrom("app_service_account_organization_roles")
    .where("app_id", "=", app_id)
    .selectAll()
    .executeTakeFirst();
  if (!row) {
    return null;
  }
  if (!isAssignableRole(row.role)) {
    throw new TypeError(
      `Invalid service account organization role stored for app '${app_id}'`,
    );
  }
  return {
    ...row,
    created_at: parseTimestampColumn(row.created_at, "created_at"),
    updated_at: parseTimestampColumn(row.updated_at, "updated_at"),
  };
}

/**
 * Make the app's service account a member of the organization that owns
 * the app, with `role` (upsert: an existing setting keeps its
 * `created_at` and records the change in `updated_at` / `updated_by`).
 * The caller checks that the app is organization-owned.
 */
export async function setAppServiceAccountOrganizationRole(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
  role: AssignableOrganizationMembershipRole,
  updated_by: string | null,
): Promise<void> {
  await assertConfigurableAppId(app_id);
  if (!isAssignableRole(role)) {
    throw new TypeError("Invalid organization role for a service account!");
  }

  const now: number = Date.now();
  await db
    .insertInto("app_service_account_organization_roles")
    .values({ app_id, role, created_at: now, updated_at: now, updated_by })
    .onConflict((oc) =>
      oc.column("app_id").doUpdateSet({ role, updated_at: now, updated_by }),
    )
    .execute();
}

/**
 * Take the app's service account out of the owning organization. Returns
 * whether it was a member.
 */
export async function deleteAppServiceAccountOrganizationRole(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: AppId,
): Promise<boolean> {
  await assertConfigurableAppId(app_id);
  const result = await db
    .deleteFrom("app_service_account_organization_roles")
    .where("app_id", "=", app_id)
    .executeTakeFirst();
  return result.numDeletedRows > BigInt(0);
}

export interface ServiceAccountVirtualOrganizationMembership {
  /** The app whose service account `uid` is. */
  app_id: AppId;
  /** The organization that currently owns the app. */
  organization_id: OrganizationID;
  role: AssignableOrganizationMembershipRole;
  /** When the app's managers opted the service account in. */
  created_at: number;
}

/**
 * The virtual organization membership of `uid` when it is the service
 * account of an organization-owned app whose managers opted it into the
 * organization; null for every other user (human accounts included) — one
 * primary-key lookup per joined table.
 */
export async function getServiceAccountVirtualOrganizationMembership(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  uid: string,
): Promise<ServiceAccountVirtualOrganizationMembership | null> {
  const row = await db
    .selectFrom("users")
    .innerJoin("apps", "apps.app_id", "users.service_account_app_id")
    .innerJoin(
      "app_service_account_organization_roles",
      "app_service_account_organization_roles.app_id",
      "apps.app_id",
    )
    .where("users.uid", "=", uid)
    .where("apps.owner_type", "=", "organization")
    .select([
      "apps.app_id as app_id",
      "apps.owner_organization_id as organization_id",
      "app_service_account_organization_roles.role as role",
      "app_service_account_organization_roles.created_at as created_at",
    ])
    .executeTakeFirst();
  if (!row) {
    return null;
  }

  const organization_id = organizationIdSchema.safeParse(row.organization_id);
  if (!organization_id.success || !isAssignableRole(row.role)) {
    throw new TypeError(
      `Invalid organization membership stored for the service account of app '${row.app_id}'`,
    );
  }
  return {
    app_id: row.app_id,
    organization_id: organization_id.data,
    role: row.role,
    created_at: parseTimestampColumn(row.created_at, "created_at"),
  };
}
