import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import {
  type ApiServerId,
  type SchemaVaultsApiServerDefinition,
  apiServerIdSchema,
  isHardcodedApiServerId,
  getHardcodedApiServer,
} from "@schemavaults/app-definitions";

export interface ILoadApiServerDefinitionOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  api_server_id: ApiServerId;
}

export async function loadApiServerDefinition({
  adapter,
  api_server_id,
}: ILoadApiServerDefinitionOpts): Promise<SchemaVaultsApiServerDefinition> {
  if (!(await apiServerIdSchema.safeParseAsync(api_server_id)).success) {
    throw new TypeError("Invalid api_server_id");
  }

  if (isHardcodedApiServerId(api_server_id)) {
    const hardcoded = getHardcodedApiServer(api_server_id);
    if (hardcoded) return hardcoded;
  }

  const response = await adapter.fetch(`/api/apis/${api_server_id}`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load API server definition: ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || !body) {
    throw new Error("Invalid response from load API server endpoint");
  }

  const result = body as {
    success: boolean;
    api_server?: SchemaVaultsApiServerDefinition;
    message?: string;
  };
  if (!result.success || !result.api_server) {
    throw new Error(
      result.message ?? "Failed to load API server definition",
    );
  }

  return result.api_server;
}

export default loadApiServerDefinition;
