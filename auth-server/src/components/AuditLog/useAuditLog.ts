"use client";

import useSWRInfinite, { type SWRInfiniteResponse } from "swr/infinite";
import { auditLogPageSchema, type AuditLogPage } from "@/lib/audit-log/audit-log-entry-schema";
import { DEFAULT_AUDIT_LOG_PAGE_SIZE } from "@/lib/audit-log/event-types";

/** `GET /api/me/audit-log`: the signed-in user's own audit log. */
export const MY_AUDIT_LOG_ENDPOINT = "/api/me/audit-log";

/** The audit log endpoint of an organization (owners and platform administrators). */
export function getOrganizationAuditLogEndpoint(organization_id: string): string {
  return `/api/organizations/${encodeURIComponent(organization_id)}/audit-log`;
}

async function fetchAuditLogPage(url: string): Promise<AuditLogPage> {
  const response = await fetch(url, { method: "GET", credentials: "include" });
  const body: unknown = await response.json().catch((): null => null);
  if (!response.ok || typeof body !== "object" || body === null || !("success" in body) || !body.success) {
    const message: unknown = typeof body === "object" && body !== null && "message" in body ? body.message : null;
    throw new Error(
      typeof message === "string" ? message : `Failed to load the audit log (status: ${response.status})`,
    );
  }
  const parsed = auditLogPageSchema.safeParse("data" in body ? body.data : undefined);
  if (!parsed.success) {
    console.error("Failed to parse the audit log:", parsed.error);
    throw new Error("Failed to parse the audit log from response");
  }
  return parsed.data;
}

/**
 * The pages of an audit log loaded so far, newest first. `setSize(size + 1)`
 * loads the next (older) page; the last page has `next_cursor: null`.
 * `preloaded` is the first page when the server rendered it.
 */
export function useAuditLog(
  endpoint: string,
  preloaded?: AuditLogPage,
): SWRInfiniteResponse<AuditLogPage, Error> {
  return useSWRInfinite<AuditLogPage, Error>(
    (index: number, previous: AuditLogPage | null): string | null => {
      if (index > 0 && (!previous || previous.next_cursor === null)) return null;
      const query = new URLSearchParams({ limit: String(DEFAULT_AUDIT_LOG_PAGE_SIZE) });
      if (index > 0 && previous?.next_cursor) query.set("cursor", previous.next_cursor);
      return `${endpoint}?${query.toString()}`;
    },
    fetchAuditLogPage,
    {
      fallbackData: preloaded ? [preloaded] : undefined,
      // Older pages do not change; only the first page gains new events.
      revalidateAll: false,
    },
  );
}
