import type {
  ApiServerDomainVerification,
  SchemaVaultsApiServerDefinition,
  SchemaVaultsApiServerDomainRef,
} from "@schemavaults/app-definitions";

export interface PreloadedApiServersTableData {
  api_servers: readonly SchemaVaultsApiServerDefinition[];
}

export interface PreloadedApiServersTableDataWithDomainRefs
  extends PreloadedApiServersTableData {
  domains: Record<string, readonly SchemaVaultsApiServerDomainRef[]>;
  /**
   * Ownership verification state of each API server's domains (matched by
   * `api_server_domain_ref_id`), shown as badges next to the domains.
   * Optional: without it, the table loads them itself.
   */
  domain_verifications?: Record<string, readonly ApiServerDomainVerification[]>;
}
