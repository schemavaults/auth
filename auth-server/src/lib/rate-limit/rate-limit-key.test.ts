import { describe, expect, test } from "bun:test";
import { buildRateLimitKey } from "./rate-limit-key";
import type { RateLimitConfig, RateLimitKeySource } from "./types";

function config(keySource: RateLimitKeySource): RateLimitConfig {
  return { name: "test", maxAttempts: 1, windowSeconds: 60, keySource };
}

describe("buildRateLimitKey", () => {
  test("builds one key per key source", () => {
    expect(buildRateLimitKey(config("ip"), { ip: "203.0.113.7" })).toBe("rl:test:203.0.113.7");
    expect(buildRateLimitKey(config("email"), { email: "jane@example.com" })).toBe("rl:test:jane@example.com");
    expect(buildRateLimitKey(config("ip+email"), { ip: "203.0.113.7", email: "jane@example.com" })).toBe(
      "rl:test:203.0.113.7:jane@example.com",
    );
    expect(buildRateLimitKey(config("uid"), { uid: "u-1" })).toBe("rl:test:u-1");
    expect(buildRateLimitKey(config("ip+uid"), { ip: "203.0.113.7", uid: "u-1" })).toBe("rl:test:203.0.113.7:u-1");
    expect(buildRateLimitKey(config("client_app_id"), { client_app_id: "my-app" })).toBe("rl:test:my-app");
  });

  test("counts the spellings of one e-mail address in one bucket", () => {
    // The login handler trims and lowercases the address before looking the
    // account up; a key on the raw value would hand each spelling of one
    // account a fresh budget.
    const key = buildRateLimitKey(config("ip+email"), { ip: "203.0.113.7", email: "jane@example.com" });
    for (const email of [" jane@example.com", "JANE@Example.com\t", "\n jane@example.com  ", " jane@example.com"]) {
      expect(buildRateLimitKey(config("ip+email"), { ip: "203.0.113.7", email })).toBe(key);
      expect(buildRateLimitKey(config("email"), { email })).toBe("rl:test:jane@example.com");
    }
  });

  test("counts the addresses of one IPv6 /64 in one bucket", () => {
    const a = buildRateLimitKey(config("ip+email"), { ip: "2001:db8:1:2::a", email: "jane@example.com" });
    const b = buildRateLimitKey(config("ip+email"), { ip: "2001:db8:1:2::b", email: "jane@example.com" });
    expect(a).toBe(b);
    expect(a).toBe("rl:test:2001:db8:1:2::/64:jane@example.com");
    expect(buildRateLimitKey(config("ip+uid"), { ip: "2001:db8:1:2::a", uid: "u-1" })).toBe(
      "rl:test:2001:db8:1:2::/64:u-1",
    );
  });

  test("buckets ip+uid without an IP under the account alone", () => {
    expect(buildRateLimitKey(config("ip+uid"), { uid: "u-1" })).toBe("rl:test:unknown-ip:u-1");
  });

  test("refuses to build a key without the identifiers its source needs", () => {
    expect(() => buildRateLimitKey(config("ip"), {})).toThrow("requires ip");
    expect(() => buildRateLimitKey(config("email"), { email: "   " })).toThrow("requires email");
    expect(() => buildRateLimitKey(config("ip+email"), { ip: "203.0.113.7" })).toThrow("requires email");
    expect(() => buildRateLimitKey(config("uid"), { ip: "203.0.113.7" })).toThrow("requires uid");
    expect(() => buildRateLimitKey(config("client_app_id"), {})).toThrow("requires client_app_id");
  });
});
