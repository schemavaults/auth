
import type { SchemaVaultsApiServerDomainRef } from "@schemavaults/app-definitions";

import type {
  ColumnType,
  Generated,
  Insertable,
  JSONColumnType,
  Selectable,
  Updateable,
} from 'kysely'

export type ApiServerDomainsTable = SchemaVaultsApiServerDomainRef;

export type ApiServerDomain = Selectable<ApiServerDomainsTable>;
export type NewApiServerDomain = Insertable<ApiServerDomainsTable>;
export type ApiServerDomainUpdate = Updateable<ApiServerDomainsTable>;
