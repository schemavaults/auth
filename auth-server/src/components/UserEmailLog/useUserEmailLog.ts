"use client";

import useSWR, { type SWRResponse } from "swr";
import { z } from "zod";
import {
  type UserEmailLogEntry,
  userEmailLogEmailTypes,
  userEmailLogSources,
  userEmailLogStatuses,
} from "@/lib/auth-db/user-email-log/user-email-log-table";

const userEmailLogEntrySchema = z.object({
  email_log_id: z.string(),
  uid: z.string(),
  email_type: z.enum(userEmailLogEmailTypes),
  source: z.enum(userEmailLogSources),
  recipient: z.string(),
  status: z.enum(userEmailLogStatuses),
  failure_reason: z.string().nullable(),
  requested_by: z.string().nullable(),
  requested_by_email: z.string().nullable(),
  created_at: z.coerce.number(),
});

/** The SWR key of a user's e-mail log; mutate it after sending them an e-mail. */
export function getUserEmailLogEndpoint(uid: string): string {
  return `/api/admin/users/${uid}/email-log`;
}

export function useUserEmailLog(
  uid: string,
): SWRResponse<readonly UserEmailLogEntry[], Error> {
  const endpoint = getUserEmailLogEndpoint(uid);
  return useSWR<readonly UserEmailLogEntry[], Error>(
    endpoint,
    async (): Promise<readonly UserEmailLogEntry[]> => {
      const response = await fetch(endpoint, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok || response.status !== 200) {
        throw new Error(
          `Failed to list the user's email log (status: ${response.status})`,
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
          "Received failure response when attempting to list the user's email log",
        );
      }

      if (
        !("data" in body) ||
        typeof body.data !== "object" ||
        !body.data ||
        !("entries" in body.data) ||
        !Array.isArray(body.data.entries)
      ) {
        throw new Error("Failed to extract 'entries' array from response");
      }

      const parsed = z.array(userEmailLogEntrySchema).safeParse(body.data.entries);
      if (!parsed.success) {
        console.error("Failed to parse the user's email log:", parsed.error);
        throw new Error("Failed to parse the user's email log from response");
      }

      return parsed.data;
    },
  );
}
