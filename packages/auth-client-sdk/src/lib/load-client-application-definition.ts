import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  type AppId,
  type SchemaVaultsApp,
  appIdSchema,
} from "@schemavaults/app-definitions";

export interface ILoadClientApplicationDefinitionOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_url: string;
  app_id: AppId;
}

export async function loadClientApplicationDefinition({
  adapter,
  auth_server_url,
  app_id,
}: ILoadClientApplicationDefinitionOpts): Promise<SchemaVaultsApp> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid app_id");
  }

  const response = await adapter.fetch(
    new URL(`/api/apps/${app_id}`, auth_server_url).toString(),
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to load client application definition: ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || !body) {
    throw new Error("Invalid response from load app endpoint");
  }

  const result = body as {
    success: boolean;
    app?: SchemaVaultsApp;
    message?: string;
  };
  if (!result.success || !result.app) {
    throw new Error(
      result.message ?? "Failed to load client application definition",
    );
  }

  return result.app;
}

export default loadClientApplicationDefinition;
