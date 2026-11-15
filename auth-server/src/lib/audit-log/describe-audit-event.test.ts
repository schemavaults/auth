import { describe, expect, test } from "bun:test";
import type { AuditLogEntry } from "./audit-log-entry-schema";
import { AUDIT_EVENT_LABELS, describeAuditEvent, isWarningAuditEvent } from "./describe-audit-event";
import { auditEventTypes, isAuditEventType } from "./event-types";

const ME = "0b6f1f9e-58c5-4c0e-9d34-2f4f3f5f7a10";
const OTHER = "7c1d2c64-0f1b-4f0e-8a55-6d1f2b3c4d5e";

function entry(overrides: Partial<AuditLogEntry>): AuditLogEntry {
  return {
    audit_event_id: "3f2b1a90-1111-4222-8333-444455556666",
    created_at: 1700000000000,
    event_type: "user.signed_in",
    actor: { uid: ME, email: "me@example.com" },
    subject: { uid: ME, email: "me@example.com" },
    organization_id: null,
    client_app_id: null,
    ip_address: null,
    user_agent: null,
    details: null,
    ...overrides,
  };
}

describe("describeAuditEvent", () => {
  test("every event type has a label and a sentence", () => {
    for (const event_type of auditEventTypes) {
      expect(AUDIT_EVENT_LABELS[event_type].length).toBeGreaterThan(0);
      const sentence = describeAuditEvent(entry({ event_type }), ME);
      expect(sentence.endsWith(".")).toBe(true);
      expect(sentence).not.toContain("undefined");
      expect(sentence).not.toContain("null");
    }
  });

  test("says 'You' to the viewer and the address to everyone else", () => {
    const signed_in = entry({ client_app_id: "notes-app", details: { mfa: true } });
    expect(describeAuditEvent(signed_in, ME)).toBe("You signed in to notes-app with multi-factor authentication.");
    expect(describeAuditEvent(signed_in)).toBe(
      "me@example.com signed in to notes-app with multi-factor authentication.",
    );
  });

  test("names both parties of an organization event", () => {
    const added = entry({
      event_type: "organization.member_added",
      actor: { uid: OTHER, email: "owner@example.com" },
      organization_id: "acme",
      details: { role: "member" },
    });
    expect(describeAuditEvent(added, ME)).toBe("owner@example.com added you to the organization as member.");
    expect(describeAuditEvent(added, OTHER)).toBe("You added me@example.com to the organization as member.");
  });

  test("a removal by the server has no actor", () => {
    const removed = entry({
      event_type: "organization.member_removed",
      actor: null,
      details: { reason: "mfa_requirement_grace_period_ended" },
    });
    expect(describeAuditEvent(removed, ME)).toBe(
      "You were removed from the organization because the grace period to enable multi-factor authentication ended.",
    );
    expect(describeAuditEvent(removed)).toBe(
      "me@example.com was removed from the organization because the grace period to enable multi-factor authentication ended.",
    );
  });

  test("a deleted account is named by its last address, or not at all", () => {
    const disabled = entry({ event_type: "user.disabled", actor: { uid: null, email: "gone@example.com" } });
    expect(describeAuditEvent(disabled, ME)).toBe("gone@example.com disabled your account and signed out its sessions.");
    const unknown = entry({ event_type: "user.disabled", actor: { uid: null, email: null } });
    expect(describeAuditEvent(unknown, ME)).toBe("A deleted user disabled your account and signed out its sessions.");
  });

  test("refused sign-ins say why", () => {
    const failed = entry({ event_type: "user.sign_in_failed", actor: null, details: { reason: "wrong_password" } });
    expect(describeAuditEvent(failed, ME)).toBe("A sign-in to your account with a wrong password was refused.");
    expect(describeAuditEvent({ ...failed, details: { reason: "account_disabled" } }, ME)).toBe(
      "A sign-in to your account was refused because the account is disabled.",
    );
  });
});

describe("event types", () => {
  test("isAuditEventType and the warning set", () => {
    expect(isAuditEventType("user.signed_in")).toBe(true);
    expect(isAuditEventType("user.nope")).toBe(false);
    expect(isWarningAuditEvent("user.sign_in_failed")).toBe(true);
    expect(isWarningAuditEvent("user.signed_in")).toBe(false);
  });
});
