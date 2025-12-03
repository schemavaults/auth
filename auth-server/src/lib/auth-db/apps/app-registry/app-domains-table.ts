
import type { SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";

import type {
  Insertable,
  Selectable,
  Updateable,
} from 'kysely'

export type AppDomainsTable = SchemaVaultsAppDomainRef;

export type AppDomain = Selectable<AppDomainsTable>;
export type NewAppDomain = Insertable<AppDomainsTable>;
export type AppDomainUpdate = Updateable<AppDomainsTable>;
