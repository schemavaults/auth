import type { ApiServerDomainVerificationTxtRecord } from "@schemavaults/app-definitions";

/**
 * Label prepended to a domain's host to name its verification TXT record
 * (an RFC 8552 underscored name, so it never collides with the host's own
 * records). Deliberately brand-neutral: white-label deployments share it,
 * and several tokens (one per registration, from any deployment) can sit in
 * the same TXT RRset.
 */
export const DOMAIN_VERIFICATION_TXT_LABEL = "_auth-domain-verification";

/** Prefix of the TXT record's value; the registration's token follows it. */
export const DOMAIN_VERIFICATION_TXT_VALUE_PREFIX = "auth-domain-verification=";

/** Longest DNS name (RFC 1035 §2.3.4, without the root's trailing dot). */
const MAX_DNS_NAME_LENGTH = 253;
const MAX_DNS_LABEL_LENGTH = 63;
const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * @description The host whose DNS proves control of a registered domain
 * (stored as an origin, e.g. `https://api.example.com`), lowercased without a
 * trailing dot. Ports and paths do not matter: whoever controls the host's
 * DNS controls every URL on it.
 *
 * @returns null when the domain cannot be verified through DNS: not an
 * http(s) URL, an IP literal, a single-label name (`localhost`, a container
 * service name), a `.localhost` name (RFC 6761 §6.3), or a host too long to
 * name a TXT record under. Only a platform administrator can verify those.
 */
export function getDnsVerifiableHostname(domain: string): string | null {
  if (typeof domain !== "string" || domain.length === 0) return null;
  let url: URL;
  try {
    url = new URL(domain);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  let host: string = url.hostname.toLowerCase();
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (host.length === 0) return null;
  // IPv6 literals keep their brackets in URL.hostname; IPv4 ones (including
  // the shorthand forms URL normalizes) end up dotted-quad.
  if (host.startsWith("[") || host.includes(":")) return null;
  if (IPV4_LITERAL.test(host)) return null;
  if (host === "localhost" || host.endsWith(".localhost")) return null;

  const labels: string[] = host.split(".");
  if (labels.length < 2) return null;
  if (labels.some((label) => label.length === 0 || label.length > MAX_DNS_LABEL_LENGTH)) {
    return null;
  }
  if (`${DOMAIN_VERIFICATION_TXT_LABEL}.${host}`.length > MAX_DNS_NAME_LENGTH) return null;
  return host;
}

/**
 * @description The TXT record proving control of `hostname` for the
 * registration holding `verification_token`.
 */
export function buildDomainVerificationTxtRecord(
  hostname: string,
  verification_token: string,
): ApiServerDomainVerificationTxtRecord {
  return {
    name: `${DOMAIN_VERIFICATION_TXT_LABEL}.${hostname}`,
    value: `${DOMAIN_VERIFICATION_TXT_VALUE_PREFIX}${verification_token}`,
  };
}

/**
 * @description The TXT record a registered domain's owner publishes, or null
 * when the domain cannot be verified through DNS (see
 * {@link getDnsVerifiableHostname}).
 */
export function getDomainVerificationTxtRecord(
  domain: string,
  verification_token: string,
): ApiServerDomainVerificationTxtRecord | null {
  const hostname: string | null = getDnsVerifiableHostname(domain);
  return hostname === null ? null : buildDomainVerificationTxtRecord(hostname, verification_token);
}

/**
 * @description Whether `expected_value` is among the published TXT values
 * (each already joined from its character-strings). Values compare exactly,
 * apart from surrounding whitespace some DNS consoles add.
 */
export function isDomainVerificationValuePublished(
  published_values: readonly string[],
  expected_value: string,
): boolean {
  return published_values.some((value) => value.trim() === expected_value);
}
