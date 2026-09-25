"use client";

import useSWR, { type SWRResponse } from "swr";
import { z } from "zod";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";
import { serverTraceOpCategories } from "@/lib/server-trace-schema";
import {
  serverTraceFiltersKey,
  serverTraceListQuery,
  serverTraceOperationsQuery,
  type ServerTraceFilters,
  type ServerTraceRangeId,
} from "@/lib/server-trace-filters";

const TRACES_ENDPOINT = "/api/admin/server-traces";
const OPERATIONS_ENDPOINT = "/api/admin/server-traces/operations";

const serverTraceRowSchema = z.object({
  event_id: z.string(),
  op_name: z.string(),
  op_category: z.enum(serverTraceOpCategories),
  start_time: z.number(),
  end_time: z.number(),
});

const serverTraceOperationSchema = z.object({
  op_name: z.string(),
  op_category: z.enum(serverTraceOpCategories),
  count: z.number(),
  last_seen: z.number(),
});

export type ServerTraceOperation = z.infer<typeof serverTraceOperationSchema>;

export interface ServerTracesSnapshot {
  traces: readonly ServerTraceRow[];
  /** When the listing was requested (Unix epoch ms); the relative time range ends here. */
  fetched_at: number;
  /** The filters the listing was requested with. */
  filters: ServerTraceFilters;
}

export interface ServerTraceOperationsSnapshot {
  operations: readonly ServerTraceOperation[];
  fetched_at: number;
  /** The time range the operations were counted over. */
  range: ServerTraceRangeId;
}

async function fetchData(url: string, label: string): Promise<unknown> {
  const response = await fetch(url, { method: "GET", credentials: "include" });
  if (!response.ok || response.status !== 200) {
    throw new Error(`Failed to list ${label} (status: ${response.status})`);
  }
  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    !body ||
    !("success" in body) ||
    !body.success ||
    !("data" in body)
  ) {
    throw new Error(`Received failure response when attempting to list ${label}`);
  }
  return body.data;
}

export interface UseServerTracesOptions {
  /** SSR-preloaded listing, used while `filters` still match the ones it was loaded with. */
  initialData?: ServerTracesSnapshot;
}

/**
 * The most recent traces matching `filters`. The relative time range is
 * resolved when each request goes out, so a revalidation re-anchors "the last
 * hour" to the current time. The previous listing stays in `data` while a
 * new filter's listing loads.
 */
export function useServerTraces(
  filters: ServerTraceFilters,
  options?: UseServerTracesOptions,
): SWRResponse<ServerTracesSnapshot, Error> {
  const key: string = serverTraceFiltersKey(filters);
  const use_initial_data: boolean =
    options?.initialData !== undefined &&
    serverTraceFiltersKey(options.initialData.filters) === key;

  return useSWR<ServerTracesSnapshot, Error>(
    [TRACES_ENDPOINT, key],
    async (): Promise<ServerTracesSnapshot> => {
      const fetched_at: number = Date.now();
      const query: string = serverTraceListQuery(filters, fetched_at).toString();
      const data: unknown = await fetchData(`${TRACES_ENDPOINT}?${query}`, "server traces");
      const parsed = z
        .object({ traces: z.array(serverTraceRowSchema) })
        .safeParse(data);
      if (!parsed.success) {
        console.error("Failed to parse server traces:", parsed.error);
        throw new Error("Failed to parse server traces from response");
      }
      return { traces: parsed.data.traces, fetched_at, filters };
    },
    {
      fallbackData: use_initial_data ? options?.initialData : undefined,
      keepPreviousData: true,
    },
  );
}

export interface UseServerTraceOperationsOptions {
  /** SSR-preloaded operations, used while `range` still matches the one they were counted over. */
  initialData?: ServerTraceOperationsSnapshot;
}

/** Every operation that recorded a trace in `range`, with its trace count. */
export function useServerTraceOperations(
  range: ServerTraceRangeId,
  options?: UseServerTraceOperationsOptions,
): SWRResponse<ServerTraceOperationsSnapshot, Error> {
  return useSWR<ServerTraceOperationsSnapshot, Error>(
    [OPERATIONS_ENDPOINT, range],
    async (): Promise<ServerTraceOperationsSnapshot> => {
      const fetched_at: number = Date.now();
      const query: string = serverTraceOperationsQuery({ range }, fetched_at).toString();
      const data: unknown = await fetchData(
        query ? `${OPERATIONS_ENDPOINT}?${query}` : OPERATIONS_ENDPOINT,
        "traced operations",
      );
      const parsed = z
        .object({ operations: z.array(serverTraceOperationSchema) })
        .safeParse(data);
      if (!parsed.success) {
        console.error("Failed to parse traced operations:", parsed.error);
        throw new Error("Failed to parse traced operations from response");
      }
      return { operations: parsed.data.operations, fetched_at, range };
    },
    {
      fallbackData:
        options?.initialData?.range === range ? options.initialData : undefined,
      keepPreviousData: true,
    },
  );
}
