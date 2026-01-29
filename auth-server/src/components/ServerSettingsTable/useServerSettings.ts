"use client";

import useSWR, { type SWRResponse, mutate } from "swr";
import type { ServerSettingRecord } from "@/lib/auth-db/server-settings/types";
import { z } from "zod";

const serverSettingRecordSchema = z.object({
  key: z.string(),
  value: z.union([
    z.string(),
    z.boolean(),
    z.number(),
    z.object({})
  ]),
  valueType: z.string(),
  description: z.string().nullable(),
  updatedAt: z.number(),
  updatedBy: z.string().nullable(),
});

const ENDPOINT = "/api/admin/settings";

export interface UseServerSettingsOptions {
  initialData?: readonly ServerSettingRecord[];
}

export function useServerSettings(
  options?: UseServerSettingsOptions
): SWRResponse<readonly ServerSettingRecord[], Error> {
  return useSWR<readonly ServerSettingRecord[], Error>(
    ENDPOINT,
    async (): Promise<readonly ServerSettingRecord[]> => {
      const response = await fetch(ENDPOINT, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok || response.status !== 200) {
        throw new Error(
          `Failed to list server settings (status: ${response.status})`
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
          "Received failure response when attempting to list server settings"
        );
      }

      if (
        !("data" in body) ||
        typeof body.data !== "object" ||
        !body.data ||
        !("settings" in body.data) ||
        !Array.isArray(body.data.settings)
      ) {
        throw new Error("Failed to extract 'settings' array from response");
      }

      const parsed = z.array(serverSettingRecordSchema).safeParse(body.data.settings);
      if (!parsed.success) {
        console.error("Failed to parse settings:", parsed.error);
        throw new Error("Failed to parse server settings from response");
      }

      return parsed.data;
    },
    {
      fallbackData: options?.initialData,
    }
  );
}

export function clearServerSettingsCache(): void {
  mutate(
    (key): boolean =>
      typeof key === "string" && key.startsWith("/api/admin/settings"),
    undefined,
    { revalidate: true }
  );
}
