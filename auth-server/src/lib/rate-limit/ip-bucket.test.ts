import { describe, expect, test } from "bun:test";
import { rateLimitIpBucket } from "./ip-bucket";

describe("rateLimitIpBucket", () => {
  test("counts an IPv4 address on its own", () => {
    expect(rateLimitIpBucket("203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitIpBucket(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(rateLimitIpBucket("203.0.113.7:51234")).toBe("203.0.113.7");
  });

  test("counts every address of one IPv6 /64 in one bucket", () => {
    const bucket = "2001:db8:abcd:12::/64";
    expect(rateLimitIpBucket("2001:db8:abcd:12::1")).toBe(bucket);
    expect(rateLimitIpBucket("2001:db8:abcd:12:ffff:ffff:ffff:ffff")).toBe(bucket);
    expect(rateLimitIpBucket("2001:0DB8:ABCD:0012:0000:0000:0000:0042")).toBe(bucket);
    expect(rateLimitIpBucket("[2001:db8:abcd:12::9]:443")).toBe(bucket);
  });

  test("keeps neighbouring /64s apart", () => {
    expect(rateLimitIpBucket("2001:db8:abcd:12::1")).not.toBe(rateLimitIpBucket("2001:db8:abcd:13::1"));
  });

  test("expands :: wherever it sits", () => {
    expect(rateLimitIpBucket("::1")).toBe("0:0:0:0::/64");
    expect(rateLimitIpBucket("fe80::")).toBe("fe80:0:0:0::/64");
    expect(rateLimitIpBucket("2001:db8::abcd:12:0:0:1")).toBe("2001:db8:0:abcd::/64");
  });

  test("counts an IPv4-mapped IPv6 address as its IPv4 address", () => {
    expect(rateLimitIpBucket("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(rateLimitIpBucket("::ffff:cb00:7107")).toBe("203.0.113.7");
    expect(rateLimitIpBucket("0:0:0:0:0:ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  test("counts a value that is no IP address as given, trimmed", () => {
    expect(rateLimitIpBucket("  not-an-ip ")).toBe("not-an-ip");
    expect(rateLimitIpBucket("fe80::1%eth0")).toBe("fe80::1%eth0");
  });
});
