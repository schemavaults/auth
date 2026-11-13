import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const { buildAuditEventRow, recordAuditEvent } = await import("./record-audit-event");

const ACTOR = "0b6f1f9e-58c5-4c0e-9d34-2f4f3f5f7a10";
const SUBJECT = "7c1d2c64-0f1b-4f0e-8a55-6d1f2b3c4d5e";

function request(headers: Record<string, string>): { headers: Headers } {
  return { headers: new Headers(headers) };
}

describe("buildAuditEventRow", () => {
  test("records the parties, the organization, the app and the request", () => {
    const row = buildAuditEventRow({
      event_type: "organization.member_added",
      actor: { uid: ACTOR, email: "owner@example.com" },
      subject: { uid: SUBJECT, email: "new@example.com" },
      organization_id: "acme",
      client_app_id: "some-app",
      request: request({ "X-Real-IP": "203.0.113.7", "User-Agent": "TestAgent/1.0" }),
      details: { role: "member" },
      now: 1700000000000,
    });
    expect(row).toEqual({
      created_at: 1700000000000,
      event_type: "organization.member_added",
      actor_uid: ACTOR,
      actor_email: "owner@example.com",
      subject_uid: SUBJECT,
      subject_email: "new@example.com",
      organization_id: "acme",
      client_app_id: "some-app",
      ip_address: "203.0.113.7",
      user_agent: "TestAgent/1.0",
      details: '{"role":"member"}',
    });
  });

  test("an event without an actor, a request or details stores nulls", () => {
    const row = buildAuditEventRow({ event_type: "user.password_reset", subject: { uid: SUBJECT }, now: 5 });
    expect(row.actor_uid).toBeNull();
    expect(row.actor_email).toBeNull();
    expect(row.subject_uid).toBe(SUBJECT);
    expect(row.subject_email).toBeNull();
    expect(row.ip_address).toBeNull();
    expect(row.user_agent).toBeNull();
    expect(row.details).toBeNull();
  });

  test("fills in looked-up addresses, and reuses the actor's for the same account", () => {
    const looked_up = buildAuditEventRow(
      { event_type: "user.disabled", actor: { uid: ACTOR, email: "admin@example.com" }, subject: { uid: SUBJECT } },
      new Map([[SUBJECT, "target@example.com"]]),
    );
    expect(looked_up.subject_email).toBe("target@example.com");

    const same = buildAuditEventRow({
      event_type: "user.signed_in",
      actor: { uid: ACTOR, email: "me@example.com" },
      subject: { uid: ACTOR },
    });
    expect(same.subject_email).toBe("me@example.com");
  });

  test("takes the first X-Forwarded-For address and cuts a long User-Agent off", () => {
    const row = buildAuditEventRow({
      event_type: "user.signed_in",
      subject: { uid: SUBJECT },
      request: request({ "X-Forwarded-For": "198.51.100.4, 10.0.0.1", "User-Agent": "a".repeat(2000) }),
    });
    expect(row.ip_address).toBe("198.51.100.4");
    expect(row.user_agent).toHaveLength(512);
  });

  test("empty details are stored as null and NUL characters are replaced", () => {
    expect(buildAuditEventRow({ event_type: "user.signed_in", details: {} }).details).toBeNull();
    expect(buildAuditEventRow({ event_type: "user.signed_in", details: { a: undefined } }).details).toBeNull();
    const row = buildAuditEventRow({ event_type: "user.signed_in", details: { label: "a\u0000b" } });
    expect(row.details).not.toContain("\\u0000");
    expect(JSON.parse(row.details as string)).toEqual({ label: "a�b" });
  });

  test("refuses a party whose uid is not a uuid", () => {
    expect(() => buildAuditEventRow({ event_type: "user.signed_in", actor: { uid: "nope" } })).toThrow(TypeError);
  });
});

describe("recordAuditEvent", () => {
  test("never throws: a failed insert is captured to the ERRORS table", async () => {
    const inserted: { table: string; values: Record<string, unknown> }[] = [];
    const db = {
      insertInto: (table: string) => ({
        values: (values: Record<string, unknown>) => ({
          execute: async (): Promise<void> => {
            if (table === "audit_events") throw new Error("audit_events is gone");
            inserted.push({ table, values });
          },
        }),
      }),
    };
    await recordAuditEvent(db as never, {
      event_type: "user.signed_in",
      actor: { uid: ACTOR, email: "me@example.com" },
      subject: { uid: ACTOR, email: "me@example.com" },
    });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]?.table).toBe("errors");
    expect(inserted[0]?.values.op_name).toBe("recordAuditEvent");
    expect(inserted[0]?.values.message).toBe("audit_events is gone");
  });
});
