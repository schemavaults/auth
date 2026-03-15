import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  type AppId,
  type SchemaVaultsAppDomainRef,
  appIdSchema,
  isHardcodedAppId,
  HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS,
  schemaVaultsAppDomainRefSchema,
} from "@schemavaults/app-definitions";

export interface IListClientApplicationDomainsOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_id: AppId;
}

export async function listClientApplicationDomains({
  adapter,
  auth_server_uri,
  app_id,
}: IListClientApplicationDomainsOpts): Promise<SchemaVaultsAppDomainRef[]> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid app_id");
  }

  if (isHardcodedAppId(app_id)) {
    return HARDCODED_CORE_SCHEMAVAULTS_APP_DOMAINS.filter(
      (d): boolean => d.app_id === app_id,
    );
  }

  const response = await adapter.fetch(`${auth_server_uri}/api/apps/${app_id}/domains`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to list client application domains: ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || !body) {
    throw new Error("Invalid response from list app domains endpoint");
  }

  const result = body as { success: boolean; list?: unknown[]; message?: string };
  if (!result.success) {
    throw new Error(
      result.message ?? "Failed to list client application domains",
    );
  }

  return schemaVaultsAppDomainRefSchema.array().parse(result.list);
}

export default listClientApplicationDomains;
