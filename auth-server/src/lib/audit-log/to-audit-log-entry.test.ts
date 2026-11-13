import { describe, expect, test } from "bun:test";
import type { AuditEventRow } from "@/lib/auth-db/audit-events";
import { auditLogPageSchema } from "./audit-log-entry-schema";
import {
  formatAuditLogCursor,
  parseAuditLogCursor,
  toAuditLogEntry,
  toAuditLogPage,
} from "./to-audit-log-entry";

const ME = "0b6f1f9e-58c5-4c0e-9d34-2f4f3f5f7a10";
const OTHER = "7c1d2c64-0f1b-4f0e-8a55-6d1f2b3c4d5e";
const EVENT_ID = "3f2b1a90-1111-4222-8333-444455556666";

function row(overrides: Partial<AuditEventRow> = {}): AuditEventRow {
  return {
    audit_event_id: EVENT_ID,
    created_at: 1700000000000,
    event_type: "user.signed_in",
    actor_uid: ME,
    actor_email: "me@example.com",
    subject_uid: ME,
    subject_email: "me@example.com",
    organization_id: null,
    client_app_id: null,
    ip_address: "203.0.113.7",
    user_agent: "TestAgent/1.0",
    details: null,
    ...overrides,
  };
}

describe("toAuditLogEntry", () => {
  test("shows a user the request details of their own events", () => {
    const entry = toAuditLogEntry(row(), { kind: "user", uid: ME });
    expect(entry.ip_address).toBe("203.0.113.7");
    expect(entry.user_agent).toBe("TestAgent/1.0");
    expect(entry.actor).toEqual({ uid: ME, email: "me@example.com" });
  });

  test("shows a user the request details of an unauthenticated attempt on their account", () => {
    const entry = toAuditLogEntry(
      row({ event_type: "user.sign_in_failed", actor_uid: null, actor_email: null }),
      { kind: "user", uid: ME },
    );
    expect(entry.actor).toBeNull();
    expect(entry.ip_address).toBe("203.0.113.7");
  });

  test("hides another user's request details from the subject of their action", () => {
    const admin_action = row({ event_type: "user.disabled", actor_uid: OTHER, actor_email: "admin@example.com" });
    const entry = toAuditLogEntry(admin_action, { kind: "user", uid: ME });
    expect(entry.ip_address).toBeNull();
    expect(entry.user_agent).toBeNull();
    expect(entry.actor).toEqual({ uid: OTHER, email: "admin@example.com" });

    // Also once the acting account was deleted (its uid is NULL, its address kept).
    const deleted_actor = toAuditLogEntry({ ...admin_action, actor_uid: null }, { kind: "user", uid: ME });
    expect(deleted_actor.ip_address).toBeNull();
    expect(deleted_actor.actor).toEqual({ uid: null, email: "admin@example.com" });
  });

  test("an organization's log never shows request details", () => {
    const entry = toAuditLogEntry(row({ organization_id: "acme" }), { kind: "organization" });
    expect(entry.ip_address).toBeNull();
    expect(entry.user_agent).toBeNull();
    expect(entry.organization_id).toBe("acme");
  });

  test("converts the driver's BIGINT string", () => {
    const entry = toAuditLogEntry(row({ created_at: "1700000000000" as unknown as number }), { kind: "organization" });
    expect(entry.created_at).toBe(1700000000000);
  });
});

describe("audit log cursors", () => {
  test("round-trip", () => {
    const cursor = formatAuditLogCursor(row());
    expect(cursor).toBe(`1700000000000.${EVENT_ID}`);
    expect(parseAuditLogCursor(cursor)).toEqual({ created_at: 1700000000000, audit_event_id: EVENT_ID });
  });

  test("anything else is refused", () => {
    for (const bad of ["", "abc", "1700000000000", `1700000000000.nope`, `-1.${EVENT_ID}`, `1.${EVENT_ID}; DROP`]) {
      expect(parseAuditLogCursor(bad)).toBeNull();
    }
  });
});

describe("toAuditLogPage", () => {
  test("names the last event as the cursor only when more events follow", () => {
    const events = [row(), row({ audit_event_id: "3f2b1a90-1111-4222-8333-444455557777", created_at: 5 })];
    const more = toAuditLogPage({ events, has_more: true }, { kind: "user", uid: ME });
    expect(more.next_cursor).toBe("5.3f2b1a90-1111-4222-8333-444455557777");
    expect(auditLogPageSchema.safeParse(more).success).toBe(true);
    expect(toAuditLogPage({ events, has_more: false }, { kind: "user", uid: ME }).next_cursor).toBeNull();
    expect(toAuditLogPage({ events: [], has_more: false }, { kind: "organization" })).toEqual({
      entries: [],
      next_cursor: null,
    });
  });
});
