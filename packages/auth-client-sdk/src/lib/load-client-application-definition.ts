import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  type AppId,
  type SchemaVaultsApp,
  appIdSchema,
  isHardcodedAppId,
  getHardcodedApp,
} from "@schemavaults/app-definitions";

export interface ILoadClientApplicationDefinitionOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_id: AppId;
}

export async function loadClientApplicationDefinition({
  adapter,
  auth_server_uri,
  app_id,
}: ILoadClientApplicationDefinitionOpts): Promise<SchemaVaultsApp> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid app_id");
  }

  if (isHardcodedAppId(app_id)) {
    const hardcoded = getHardcodedApp(app_id);
    if (hardcoded) return hardcoded;
  }

  const response = await adapter.fetch(`${auth_server_uri}/api/apps/${app_id}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load client application definition: ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || !body) {
    throw new Error("Invalid response from load app endpoint");
  }

  const result = body as { success: boolean; app?: SchemaVaultsApp; message?: string };
  if (!result.success || !result.app) {
    throw new Error(
      result.message ?? "Failed to load client application definition",
    );
  }

  return result.app;
}

export default loadClientApplicationDefinition;
