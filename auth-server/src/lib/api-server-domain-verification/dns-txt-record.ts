import type { ApiServerDomainVerificationTxtRecord } from "@schemavaults/app-definitions";
import { getAuthServerAppId } from "@/lib/config/auth-server-app-id";

/**
 * Suffix of the verification record's prefix, which starts with the auth
 * server deployment's own app id (`SCHEMAVAULTS_AUTH_SERVER_APP_ID`), so a
 * domain's DNS admin can tell which deployment a record is for:
 * `schemavaults-auth-domain-verification`, `acme-auth-domain-verification`.
 */
export const DOMAIN_VERIFICATION_RECORD_SUFFIX = "-domain-verification";

/** Longest DNS name (RFC 1035 §2.3.4, without the root's trailing dot). */
const MAX_DNS_NAME_LENGTH = 253;
const MAX_DNS_LABEL_LENGTH = 63;
/**
 * Most characters of the app id that fit the record name's label:
 * `_` + app id + suffix must stay within one 63-character DNS label.
 */
export const MAX_DOMAIN_VERIFICATION_APP_ID_LENGTH =
  MAX_DNS_LABEL_LENGTH - 1 - DOMAIN_VERIFICATION_RECORD_SUFFIX.length;
/**
 * Longest host a verification record can be named under, whatever the
 * deployment's app id: the record's own label (at most 63 characters) and
 * its dot come first.
 */
const MAX_VERIFIABLE_HOST_LENGTH = MAX_DNS_NAME_LENGTH - MAX_DNS_LABEL_LENGTH - 1;
const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * @description The prefix of this deployment's verification records:
 * `<app id>-domain-verification`. It names the record (after an RFC 8552
 * underscore, so it never collides with the host's own records:
 * `_schemavaults-auth-domain-verification.api.example.com`) and starts its
 * value (`schemavaults-auth-domain-verification=<token>`). App ids are
 * already DNS-safe (`[a-z0-9_-]`); one longer than
 * {@link MAX_DOMAIN_VERIFICATION_APP_ID_LENGTH} is shortened to fit the
 * label (the token, not the prefix, is what tells registrations apart).
 *
 * @param auth_server_app_id The deployment's app id (default: this one's).
 */
export function getDomainVerificationRecordPrefix(
  auth_server_app_id: string = getAuthServerAppId(),
): string {
  let app_id: string = auth_server_app_id.toLowerCase();
  if (app_id.length > MAX_DOMAIN_VERIFICATION_APP_ID_LENGTH) {
    app_id = app_id.slice(0, MAX_DOMAIN_VERIFICATION_APP_ID_LENGTH).replace(/[-_]+$/, "");
  }
  return `${app_id}${DOMAIN_VERIFICATION_RECORD_SUFFIX}`;
}

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
  if (host.length > MAX_VERIFIABLE_HOST_LENGTH) return null;
  return host;
}

/**
 * @description The TXT record proving control of `hostname` for the
 * registration holding `verification_token`, on the deployment with the
 * given app id (default: this one), e.g.
 * `_schemavaults-auth-domain-verification.api.example.com` TXT
 * `schemavaults-auth-domain-verification=<token>`.
 */
export function buildDomainVerificationTxtRecord(
  hostname: string,
  verification_token: string,
  auth_server_app_id: string = getAuthServerAppId(),
): ApiServerDomainVerificationTxtRecord {
  const prefix: string = getDomainVerificationRecordPrefix(auth_server_app_id);
  return {
    name: `_${prefix}.${hostname}`,
    value: `${prefix}=${verification_token}`,
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
  auth_server_app_id: string = getAuthServerAppId(),
): ApiServerDomainVerificationTxtRecord | null {
  const hostname: string | null = getDnsVerifiableHostname(domain);
  return hostname === null
    ? null
    : buildDomainVerificationTxtRecord(hostname, verification_token, auth_server_app_id);
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
