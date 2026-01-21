import type { SchemaVaultsApiServerDefinition } from "@schemavaults/app-definitions";

export interface PreloadedApiServersTableData {
  api_servers: readonly SchemaVaultsApiServerDefinition[];
}
