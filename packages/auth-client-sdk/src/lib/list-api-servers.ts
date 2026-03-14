import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type {
  ListApiServersQueryResponse,
  ListApiServersQueryType,
} from "@schemavaults/app-definitions";
import type { PaginationOptions } from "@schemavaults/auth-common";

export interface IListApiServersOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  query_type: ListApiServersQueryType;
  query_params?: URLSearchParams;
  pagination?: PaginationOptions;
}

export async function listApiServers({
  adapter,
  query_type,
  query_params,
  pagination,
}: IListApiServersOpts): Promise<ListApiServersQueryResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("list_apis_query_type", query_type);

  if (query_params) {
    for (const [key, value] of query_params.entries()) {
      searchParams.set(key, value);
    }
  }

  if (pagination) {
    if (typeof pagination.page_index === "number") {
      searchParams.set("page_index", String(pagination.page_index));
    }
    if (typeof pagination.page_size === "number") {
      searchParams.set("page_size", String(pagination.page_size));
    }
  }

  const response = await adapter.fetch(
    `/api/apis?${searchParams.toString()}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to list API servers: ${response.status}`);
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || !body) {
    throw new Error("Invalid response from list API servers endpoint");
  }

  const result = body as ListApiServersQueryResponse;
  if (!result.success) {
    throw new Error(result.message ?? "Failed to list API servers");
  }

  return result;
}

export default listApiServers;
