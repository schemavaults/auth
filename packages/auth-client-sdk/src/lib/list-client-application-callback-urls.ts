import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  type AppId,
  type SchemaVaultsAppCallbackUrlRef,
  appIdSchema,
  schemaVaultsAppCallbackUrlRefSchema,
} from "@schemavaults/app-definitions";

export interface IListClientApplicationCallbackUrlsOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  auth_server_uri: string;
  app_id: AppId;
}

export async function listClientApplicationCallbackUrls({
  adapter,
  auth_server_uri,
  app_id,
}: IListClientApplicationCallbackUrlsOpts): Promise<
  SchemaVaultsAppCallbackUrlRef[]
> {
  if (!(await appIdSchema.safeParseAsync(app_id)).success) {
    throw new TypeError("Invalid app_id");
  }

  const response = await adapter.fetch(
    new URL(`/api/apps/${app_id}/callback-urls`, auth_server_uri).toString(),
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to list client application callback URLs: ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || !body) {
    throw new Error("Invalid response from list app callback URLs endpoint");
  }

  const result = body as {
    success: boolean;
    list?: unknown[];
    message?: string;
  };
  if (!result.success) {
    throw new Error(
      result.message ?? "Failed to list client application callback URLs",
    );
  }

  return schemaVaultsAppCallbackUrlRefSchema.array().parse(result.list);
}

export default listClientApplicationCallbackUrls;
