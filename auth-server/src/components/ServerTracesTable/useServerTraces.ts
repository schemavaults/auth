"use client";

import useSWR, { type SWRResponse } from "swr";
import type { ServerTraceRow } from "@/lib/auth-db/server-traces";
import { z } from "zod";
import { serverTraceOpCategories } from "@/lib/server-trace-schema";

const serverTraceRowSchema = z.object({
  event_id: z.string(),
  op_name: z.string(),
  op_category: z.enum(serverTraceOpCategories),
  start_time: z.number(),
  end_time: z.number(),
});

const ENDPOINT = "/api/admin/server-traces";

export interface UseServerTracesOptions {
  initialData?: readonly ServerTraceRow[];
}

export function useServerTraces(
  options?: UseServerTracesOptions
): SWRResponse<readonly ServerTraceRow[], Error> {
  return useSWR<readonly ServerTraceRow[], Error>(
    ENDPOINT,
    async (): Promise<readonly ServerTraceRow[]> => {
      const response = await fetch(ENDPOINT, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok || response.status !== 200) {
        throw new Error(
          `Failed to list server traces (status: ${response.status})`
        );
      }

      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        !body ||
        !("success" in body) ||
        !body.success
      ) {
        throw new Error(
          "Received failure response when attempting to list server traces"
        );
      }

      if (
        !("data" in body) ||
        typeof body.data !== "object" ||
        !body.data ||
        !("traces" in body.data) ||
        !Array.isArray(body.data.traces)
      ) {
        throw new Error("Failed to extract 'traces' array from response");
      }

      const parsed = z.array(serverTraceRowSchema).safeParse(body.data.traces);
      if (!parsed.success) {
        console.error("Failed to parse server traces:", parsed.error);
        throw new Error("Failed to parse server traces from response");
      }

      return parsed.data;
    },
    {
      fallbackData: options?.initialData,
    }
  );
}
