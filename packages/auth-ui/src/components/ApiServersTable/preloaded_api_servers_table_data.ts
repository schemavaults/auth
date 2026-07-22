import type {
  SchemaVaultsApiServerDefinition,
  SchemaVaultsApiServerDomainRef,
} from "@schemavaults/app-definitions";

export interface PreloadedApiServersTableData {
  api_servers: readonly SchemaVaultsApiServerDefinition[];
}

export interface PreloadedApiServersTableDataWithDomainRefs
  extends PreloadedApiServersTableData {
  domains: Record<string, readonly SchemaVaultsApiServerDomainRef[]>;
}
