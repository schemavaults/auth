import type { AppToApiPermission } from "@schemavaults/app-definitions";
import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

export type AppsToApisPermissionsTable = AppToApiPermission;

export type AppsToApisPermission = Selectable<AppsToApisPermissionsTable>;
export type NewAppsToApisPermission = Insertable<AppsToApisPermissionsTable>;
export type AppsToApisPermissionUpdate = Updateable<AppsToApisPermissionsTable>;
