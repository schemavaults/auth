
import type { AppToApiPermission } from '@schemavaults/app-definitions';
import type {
  ColumnType,
  Generated,
  Insertable,
  JSONColumnType,
  Selectable,
  Updateable,
} from 'kysely'

export type AppsToApisPermissionsTable = AppToApiPermission;

export type AppsToApisPermission = Selectable<AppsToApisPermissionsTable>;
export type NewAppsToApisPermission = Insertable<AppsToApisPermissionsTable>;
export type AppsToApisPermissionUpdate = Updateable<AppsToApisPermissionsTable>;
