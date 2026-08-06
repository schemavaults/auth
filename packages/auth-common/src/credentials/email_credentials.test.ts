import { describe, test, expect } from "bun:test";
import { emailCredentialsSchema } from "./email_credentials";
import { emailRegistrationCredentialsSchema } from "./register_credentials";
import { normalizeEmail, normalizedEmailSchema } from "./normalize-email";

const VALID_PASSWORD = "TestPassword123!";

describe("normalizeEmail", () => {
  test("lowercases the whole address", () => {
    expect(normalizeEmail("Karalynn@BoTreeInc.com")).toBe(
      "karalynn@botreeinc.com",
    );
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeEmail("  user@example.com ")).toBe("user@example.com");
  });

  test("leaves an already-canonical address unchanged", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });
});

describe("normalizedEmailSchema", () => {
  test("parses to the canonical lowercased form", () => {
    const parsed = normalizedEmailSchema.safeParse(" User@Example.COM ");
    expect(parsed.success).toBeTrue();
    if (parsed.success) {
      expect(parsed.data).toBe("user@example.com");
    }
  });

  test("still rejects invalid emails", () => {
    expect(normalizedEmailSchema.safeParse("not-an-email").success).toBeFalse();
  });
});

describe("emailCredentialsSchema", () => {
  test("normalizes the email field so case-variants parse to the same address", () => {
    const parsed = emailCredentialsSchema.safeParse({
      email: "Karalynn@botreeinc.com",
      password: VALID_PASSWORD,
    });
    expect(parsed.success).toBeTrue();
    if (parsed.success) {
      expect(parsed.data.email).toBe("karalynn@botreeinc.com");
    }
  });
});

describe("emailRegistrationCredentialsSchema", () => {
  test("normalizes the email field", () => {
    const parsed = emailRegistrationCredentialsSchema.safeParse({
      email: "Karalynn@botreeinc.com",
      password: VALID_PASSWORD,
      confirm: VALID_PASSWORD,
      invite_code: "invite-code-123",
    });
    expect(parsed.success).toBeTrue();
    if (parsed.success) {
      expect(parsed.data.email).toBe("karalynn@botreeinc.com");
    }
  });
});
