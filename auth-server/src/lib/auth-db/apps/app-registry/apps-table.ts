
import type { SchemaVaultsApp } from "@schemavaults/app-definitions";

import type {
  Insertable,
  Selectable,
  Updateable,
} from 'kysely'

export type AppsTable = SchemaVaultsApp;

export type App = Selectable<AppsTable>
export type NewApp = Insertable<AppsTable>
export type AppUpdate = Updateable<AppsTable>
