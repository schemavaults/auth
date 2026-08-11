import type { SchemaVaultsAppCallbackUrlRef } from "@schemavaults/app-definitions";

import type { Insertable, Selectable, Updateable } from "@schemavaults/dbh";

export type AppCallbackUrlsTable = SchemaVaultsAppCallbackUrlRef;

export type AppCallbackUrl = Selectable<AppCallbackUrlsTable>;
export type NewAppCallbackUrl = Insertable<AppCallbackUrlsTable>;
export type AppCallbackUrlUpdate = Updateable<AppCallbackUrlsTable>;
