import type { ISchemaVaultsAuthClientAdapter } from "@/types/ISchemaVaultsAuthClientAdapter";
import type {
  ListAppsQueryResponse,
  ListAppsQueryType,
} from "@schemavaults/app-definitions";
import type { PaginationOptions } from "@schemavaults/auth-common";

export interface IListClientApplicationsOpts {
  adapter: ISchemaVaultsAuthClientAdapter;
  query_type: ListAppsQueryType;
  query_params?: URLSearchParams;
  pagination?: PaginationOptions;
}

export async function listClientApplications({
  adapter,
  query_type,
  query_params,
  pagination,
}: IListClientApplicationsOpts): Promise<ListAppsQueryResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("list_apps_query_type", query_type);

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
    `/api/apps?${searchParams.toString()}`,
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to list client applications: ${response.status}`,
    );
  }

  const body: unknown = await response.json();
  if (typeof body !== "object" || !body) {
    throw new Error("Invalid response from list client applications endpoint");
  }

  const result = body as ListAppsQueryResponse;
  if (!result.success) {
    throw new Error(
      result.message ?? "Failed to list client applications",
    );
  }

  return result;
}

export default listClientApplications;
