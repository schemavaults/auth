
import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";

import type {
  Insertable,
  Selectable,
  Updateable,
} from 'kysely'

export type ApiServersTable = SchemaVaultsApiServerDefinition;

export type ApiServer = Selectable<ApiServersTable>;
export type NewApiServer = Insertable<ApiServersTable>;
export type ApiServerUpdate = Updateable<ApiServersTable>;
