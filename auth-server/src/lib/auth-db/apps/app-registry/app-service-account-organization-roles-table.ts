import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";
import type { AssignableOrganizationMembershipRole } from "@schemavaults/auth-common";

/**
 * At most one row per app (migration 00043). A row's presence makes the
 * app's service account a VIRTUAL member of the organization that owns
 * the app, with `role` — see `listUserOrganizationMemberships`. The
 * organization is deliberately not stored: it is the app's owner at
 * lookup time, so the membership only applies while the app is
 * organization-owned.
 */
export interface AppServiceAccountOrganizationRolesTable {
  app_id: string;
  role: AssignableOrganizationMembershipRole;
  created_at: number;
  updated_at: number;
  updated_by: string | null;
}

export type AppServiceAccountOrganizationRole =
  Selectable<AppServiceAccountOrganizationRolesTable>;
export type NewAppServiceAccountOrganizationRole =
  Insertable<AppServiceAccountOrganizationRolesTable>;
export type AppServiceAccountOrganizationRoleUpdate =
  Updateable<AppServiceAccountOrganizationRolesTable>;
