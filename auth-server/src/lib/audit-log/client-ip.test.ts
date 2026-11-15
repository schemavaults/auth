import { describe, expect, test } from "bun:test";
import { normalizeClientIp } from "./client-ip";

describe("normalizeClientIp", () => {
  test("keeps valid IPv4 and IPv6 addresses", () => {
    expect(normalizeClientIp("203.0.113.7")).toBe("203.0.113.7");
    expect(normalizeClientIp(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(normalizeClientIp("2001:DB8::1")).toBe("2001:db8::1");
    expect(normalizeClientIp("::ffff:192.0.2.1")).toBe("::ffff:192.0.2.1");
  });

  test("drops the port of address:port forms", () => {
    expect(normalizeClientIp("203.0.113.7:51234")).toBe("203.0.113.7");
    expect(normalizeClientIp("[2001:db8::1]:443")).toBe("2001:db8::1");
    expect(normalizeClientIp("[2001:db8::1]")).toBe("2001:db8::1");
  });

  test("refuses anything that is not an address", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "   ",
      "unknown",
      "999.1.1.1",
      "1.2.3",
      "203.0.113.7 - your account is compromised, call 555-0100",
      "<script>alert(1)</script>",
      "203.0.113.7, 10.0.0.1",
      "fe80::1%eth0",
      "example.com",
      "1".repeat(500),
    ]) {
      expect(normalizeClientIp(bad)).toBeNull();
    }
  });
});
