import { appToApiPermissionSchema, isHardcodedApiServerId, type AppToApiPermission, type HardcodedApiServerId } from "@schemavaults/app-definitions";
import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";



export type AppToHardcodedApiPermission = AppToApiPermission & {
  api_server_id: HardcodedApiServerId
}

export const appToHardcodedApiPermissionSchema = appToApiPermissionSchema.refine((values): values is AppToHardcodedApiPermission => {
  return isHardcodedApiServerId(values.api_server_id);
}, "Expected 'api_server_id' to be in list of hardcoded API servers!")


export type AppsToHardcodedApisPermissionsTable = AppToHardcodedApiPermission;

export type AppsToHardcodedApisPermission = Selectable<AppsToHardcodedApisPermissionsTable>;
export type NewAppsToHardcodedApisPermission = Insertable<AppsToHardcodedApisPermissionsTable>;
export type AppsToHardcodedApisPermissionUpdate = Updateable<AppsToHardcodedApisPermissionsTable>;
