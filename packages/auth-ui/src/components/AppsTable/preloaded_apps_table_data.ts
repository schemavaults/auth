import type { SchemaVaultsApp, SchemaVaultsAppDomainRef } from "@schemavaults/app-definitions";

export interface PreloadedAppsTableDataWithDomainRefs {
  apps: readonly SchemaVaultsApp[];
  domains: Record<string, readonly SchemaVaultsAppDomainRef[]>;
}
