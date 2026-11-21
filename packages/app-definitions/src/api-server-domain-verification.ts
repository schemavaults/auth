import { z } from "zod";

/**
 * How the ownership of a domain registered for an API server was verified.
 * VERIFIED domains take precedence when RFC 8707 `resource` URLs are resolved
 * to API servers, and once the auth server requires verification (its
 * `require_api_server_domain_verification` setting) they are the only ones
 * that resolve, so one tenant cannot claim another's origin.
 *
 * - `dns_txt`: the auth server found the registration's token in a DNS TXT
 *   record on the domain's host.
 * - `administrator`: a platform administrator attested the registration
 *   (hosts DNS cannot verify, such as `localhost` or an internal name).
 */
export const API_SERVER_DOMAIN_VERIFICATION_METHODS = [
  "dns_txt",
  "administrator",
] as const satisfies readonly string[];

export type ApiServerDomainVerificationMethod =
  (typeof API_SERVER_DOMAIN_VERIFICATION_METHODS)[number];

export const apiServerDomainVerificationMethodSchema = z.enum(
  API_SERVER_DOMAIN_VERIFICATION_METHODS,
);

/** The DNS TXT record that proves control of a registered domain's host. */
export const apiServerDomainVerificationTxtRecordSchema = z.object({
  /**
   * Fully qualified record name, after the auth server deployment's own app
   * id, e.g. `_schemavaults-auth-domain-verification.api.example.com`
   */
  name: z.string().min(1),
  /** Exact record value to publish. */
  value: z.string().min(1),
});

export type ApiServerDomainVerificationTxtRecord = z.infer<
  typeof apiServerDomainVerificationTxtRecordSchema
>;

/**
 * Verification state of one domain registered for an API server, as the
 * auth server reports it next to the domain
 * (`GET /api/apis/{api_server_id}/domains`) and after a verification
 * attempt (`POST .../domains/{api_server_domain_ref_id}/verify`).
 * Unknown members are tolerated, so later additions do not break parsers.
 */
export const apiServerDomainVerificationSchema = z.object({
  api_server_domain_ref_id: z.guid(),
  /**
   * Whether the domain's ownership is verified: it then takes precedence
   * over other API servers' unverified registrations of it, and keeps
   * resolving RFC 8707 `resource` URLs once the auth server requires
   * verification.
   */
  verified: z.boolean(),
  /** When the domain was verified (epoch ms); null while pending. */
  verified_at: z.number().nonnegative().nullable(),
  verification_method: apiServerDomainVerificationMethodSchema.nullable(),
  /**
   * The TXT record to publish (and keep published) for DNS verification;
   * null when the domain's host cannot be verified through DNS (loopback
   * and IP-literal hosts, single-label names), which only a platform
   * administrator can verify.
   */
  dns_txt_record: apiServerDomainVerificationTxtRecordSchema.nullable(),
});

export type ApiServerDomainVerification = z.infer<
  typeof apiServerDomainVerificationSchema
>;
