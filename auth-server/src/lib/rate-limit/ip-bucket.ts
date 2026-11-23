import "server-only";

import { isIPv6 } from "node:net";
import { normalizeClientIp } from "@/lib/audit-log/client-ip";

/**
 * Splits a valid IPv6 address into its eight 16-bit groups, expanding `::`
 * and an embedded dotted IPv4 tail (`::ffff:192.0.2.1`).
 */
function ipv6Groups(address: string): number[] {
  const [head = "", tail] = address.split("::");
  const parse = (part: string): number[] => {
    if (part.length === 0) return [];
    return part.split(":").flatMap((group: string): number[] => {
      if (!group.includes(".")) return [parseInt(group, 16)];
      const [a = 0, b = 0, c = 0, d = 0] = group.split(".").map(Number);
      return [(a << 8) | b, (c << 8) | d];
    });
  };
  const head_groups: number[] = parse(head);
  if (tail === undefined) return head_groups;
  const tail_groups: number[] = parse(tail);
  const zeros: number[] = new Array<number>(8 - head_groups.length - tail_groups.length).fill(0);
  return [...head_groups, ...zeros, ...tail_groups];
}

/**
 * The bucket a client address is counted in by per-IP rate limits.
 *
 * - IPv4 addresses count on their own.
 * - IPv6 addresses count per /64: a single subscriber (a home connection, a
 *   cloud VM) is routinely handed a whole /64, so per-address buckets would
 *   give one caller 2^64 fresh budgets.
 * - IPv4-mapped IPv6 addresses (`::ffff:192.0.2.1`, what a dual-stack socket
 *   reports for an IPv4 client) count as the IPv4 address they carry.
 * - A port or brackets are dropped and the result is lowercased, so the
 *   spellings of one address share a bucket.
 *
 * A value that is not an IP address (a proxy header carrying something
 * else) is counted as given, trimmed: it still gets a bucket of its own.
 */
export function rateLimitIpBucket(ip: string): string {
  const address: string | null = normalizeClientIp(ip);
  if (address === null) return ip.trim();
  if (!isIPv6(address)) return address;

  const groups: number[] = ipv6Groups(address);
  const is_ipv4_mapped: boolean =
    groups.slice(0, 5).every((group: number): boolean => group === 0) && groups[5] === 0xffff;
  if (is_ipv4_mapped) {
    const [high = 0, low = 0] = groups.slice(6);
    return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  }
  const prefix: string = groups
    .slice(0, 4)
    .map((group: number): string => group.toString(16))
    .join(":");
  return `${prefix}::/64`;
}

export default rateLimitIpBucket;
