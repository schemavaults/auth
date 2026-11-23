import { ConflictError } from "@/lib/error/ConflictError";

/**
 * A domain registered for an app (`APP_DOMAINS`) or an API server
 * (`API_SERVER_DOMAINS`), reduced to the fields conflicts are judged on.
 */
export interface DomainRegistration {
  /** The row's id: `app_domain_ref_id` / `api_server_domain_ref_id` */
  ref_id: string;
  domain: string;
  environment: string;
}

/** The kind of resource a domain is registered for, as conflict messages name it. */
export interface DomainRegistrationOwner {
  /** How messages name the resource ("this app ...") */
  label: string;
  /** The wire name of the registration's id */
  ref_id_field: string;
}

export const APP_DOMAIN_REGISTRATION_OWNER = {
  label: "app",
  ref_id_field: "app_domain_ref_id",
} as const satisfies DomainRegistrationOwner;

export const API_SERVER_DOMAIN_REGISTRATION_OWNER = {
  label: "API server",
  ref_id_field: "api_server_domain_ref_id",
} as const satisfies DomainRegistrationOwner;

/**
 * @description Refuses a new domain registration that clashes with one the
 * resource already has, with a message saying which clash it is:
 *
 * - the same domain in the same environment (registering it again is a no-op
 *   the caller should hear about), or
 * - another domain under the same ref id (the id is the table's primary key,
 *   so every registration needs a fresh one).
 *
 * Domains are compared exactly: `https://example.com` and
 * `https://www.example.com` are different domains, so an apex domain and its
 * `www.` subdomain are registered separately and never conflict.
 *
 * @throws ConflictError when the registration clashes with an existing one
 */
export function assertDomainRegistrationAvailable(
  owner: DomainRegistrationOwner,
  existing: readonly DomainRegistration[],
  candidate: DomainRegistration,
): void {
  const sameDomain: boolean = existing.some(
    (registration) =>
      registration.environment === candidate.environment &&
      registration.domain === candidate.domain,
  );
  if (sameDomain) {
    throw new ConflictError(
      `"${candidate.domain}" is already registered for this ${owner.label} in the ${candidate.environment} environment.`,
    );
  }

  if (existing.some((registration) => registration.ref_id === candidate.ref_id)) {
    throw domainRefIdInUseError(owner, candidate.ref_id);
  }
}

/**
 * @description The conflict of a registration whose ref id is already taken,
 * either by another domain of the same resource or (the ids are unique across
 * the whole table) by a domain of a different one.
 */
export function domainRefIdInUseError(
  owner: DomainRegistrationOwner,
  ref_id: string,
): ConflictError {
  return new ConflictError(
    `Another domain is already registered with ${owner.ref_id_field} "${ref_id}". Each domain needs its own ${owner.ref_id_field}: generate a new UUID and retry.`,
  );
}

/**
 * @description The conflict of an API server domain registration whose ref
 * id was ever used: by a live domain of any API server, or by one that has
 * since been removed. API server domain ref ids are never registered twice
 * (migration 00058), so whatever names a registration by its id keeps
 * naming the same domain.
 */
export function domainRefIdUsedError(
  owner: DomainRegistrationOwner,
  ref_id: string,
): ConflictError {
  return new ConflictError(
    `The ${owner.ref_id_field} "${ref_id}" is already used by another domain, or was used by a domain that has been removed (ids are never reused). Each domain needs its own ${owner.ref_id_field}: generate a new UUID and retry.`,
  );
}
