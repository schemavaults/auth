import "server-only";

import { normalizeEmail } from "@schemavaults/auth-common";
import { rateLimitIpBucket } from "./ip-bucket";
import type { RateLimitConfig, RateLimitIdentifiers } from "./types";

function requireIdentifier(config: RateLimitConfig, name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Rate limit '${config.name}' requires ${name}`);
  }
  return value;
}

/**
 * The address an identifier is counted under. Every caller-supplied part is
 * normalized the way the endpoints themselves read it, so that spellings of
 * one subject (`" Jane@Example.com"` and `"jane@example.com"`, two addresses
 * of one IPv6 /64) share a bucket instead of each getting a fresh budget.
 */
function emailPart(config: RateLimitConfig, identifiers: RateLimitIdentifiers): string {
  return requireIdentifier(config, "email", identifiers.email && normalizeEmail(identifiers.email));
}

function ipPart(config: RateLimitConfig, identifiers: RateLimitIdentifiers): string {
  return rateLimitIpBucket(requireIdentifier(config, "ip", identifiers.ip));
}

/** The Redis key of a limit's counter for the given identifiers (`rl:<name>:<...>`). */
export function buildRateLimitKey(
  config: RateLimitConfig,
  identifiers: RateLimitIdentifiers,
): string {
  const prefix = `rl:${config.name}`;
  switch (config.keySource) {
    case "ip":
      return `${prefix}:${ipPart(config, identifiers)}`;
    case "email":
      return `${prefix}:${emailPart(config, identifiers)}`;
    case "ip+email":
      return `${prefix}:${ipPart(config, identifiers)}:${emailPart(config, identifiers)}`;
    case "uid":
      return `${prefix}:${requireIdentifier(config, "uid", identifiers.uid)}`;
    case "ip+uid": {
      const uid: string = requireIdentifier(config, "uid", identifiers.uid);
      // IP is best-effort here: when it can't be determined we still bucket
      // per-uid so the per-account cap always applies.
      const ip: string = identifiers.ip ? rateLimitIpBucket(identifiers.ip) : "unknown-ip";
      return `${prefix}:${ip}:${uid}`;
    }
    case "client_app_id":
      return `${prefix}:${requireIdentifier(config, "client_app_id", identifiers.client_app_id)}`;
  }
}

export default buildRateLimitKey;
