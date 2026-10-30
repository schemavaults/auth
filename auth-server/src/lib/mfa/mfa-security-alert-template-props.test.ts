import { describe, expect, test } from "bun:test";
import {
  buildMfaSecurityAlertTemplateProps,
  getMfaSecurityAlertRecipientName,
  MFA_SECURITY_ALERT_EVENT_TYPES,
  type MfaSecurityAlertAction,
} from "./mfa-security-alert-template-props";

describe("buildMfaSecurityAlertTemplateProps", () => {
  const actions = Object.keys(MFA_SECURITY_ALERT_EVENT_TYPES) as MfaSecurityAlertAction[];

  for (const action of actions) {
    test(`'${action}' carries the props the mail server's security-alert requires`, () => {
      const props = buildMfaSecurityAlertTemplateProps({
        action,
        name: "Jane",
        occurred_at: Date.UTC(2026, 9, 30, 20, 36, 9),
        auth_server_url: "https://auth.example.com",
        product_name: "Acme",
      });
      expect(props).toEqual({
        name: "Jane",
        eventType: MFA_SECURITY_ALERT_EVENT_TYPES[action],
        eventTime: "Fri, 30 Oct 2026 20:36:09 GMT",
        secureAccountUrl: "https://auth.example.com/mfa",
        productName: "Acme",
      });
    });
  }

  test("maps every action to an MFA event type", () => {
    expect(MFA_SECURITY_ALERT_EVENT_TYPES).toEqual({
      enabled: "mfa-enabled",
      removed: "mfa-removed",
      admin_reset: "mfa-reset-by-admin",
      recovery_codes_regenerated: "mfa-recovery-codes-regenerated",
    });
  });
});

describe("getMfaSecurityAlertRecipientName", () => {
  test("prefers the display name, then the first name, then the e-mail address", () => {
    expect(getMfaSecurityAlertRecipientName({ email: "j@example.com", display_name: "Jane D", first_name: "Jane" })).toBe("Jane D");
    expect(getMfaSecurityAlertRecipientName({ email: "j@example.com", display_name: "  ", first_name: "Jane" })).toBe("Jane");
    expect(getMfaSecurityAlertRecipientName({ email: "j@example.com", display_name: null, first_name: null })).toBe("j@example.com");
  });
});
