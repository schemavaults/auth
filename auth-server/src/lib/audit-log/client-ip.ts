import { isIP } from "node:net";

/**
 * The address to store for a request, or null when the proxy headers do not
 * carry one. `extractClientIp()` returns `X-Real-IP` / `X-Forwarded-For` as
 * sent; where no proxy overwrites them, that is whatever text the caller
 * chose. Only a syntactically valid IPv4 or IPv6 address is kept (an
 * `address:port` or `[address]:port` form loses its port), so the column
 * never holds free text that would later be shown to the account's owner.
 */
export function normalizeClientIp(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  let candidate: string = value.trim();
  // Longer than any address with a port: not worth parsing.
  if (candidate.length === 0 || candidate.length > 64) return null;

  const bracketed = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(candidate);
  if (bracketed?.[1] !== undefined) {
    candidate = bracketed[1];
  } else {
    const v4_with_port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(candidate);
    if (v4_with_port?.[1] !== undefined) candidate = v4_with_port[1];
  }
  // No zone identifiers ("fe80::1%eth0"): isIP accepts them, and the zone is free text.
  if (candidate.includes("%")) return null;
  return isIP(candidate) === 0 ? null : candidate.toLowerCase();
}

export default normalizeClientIp;
