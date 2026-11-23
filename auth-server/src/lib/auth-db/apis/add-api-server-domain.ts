import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  schemaVaultsApiServerDomainRefSchema,
  type SchemaVaultsApiServerDomainRef,
} from "@schemavaults/app-definitions";
import { generateDomainVerificationToken } from "@/lib/auth-db/api-server-domain-verifications/generate-domain-verification-token";
import { ConflictError } from "@/lib/error/ConflictError";
import isUniqueViolation from "@/lib/auth-db/is-unique-violation";
import {
  API_SERVER_DOMAIN_REGISTRATION_OWNER,
  assertDomainRegistrationAvailable,
  domainRefIdUsedError,
} from "@/lib/auth-db/domain-registrations/registration-conflicts";
import { getApiServerDomains } from "./get-api-server-domains";

/**
 * @description Registers a domain to an API server, unverified and with
 * its own verification token.
 * @throws ConflictError when the domain is already registered to this API
 * server in that environment, or the ref id was ever used (by a live
 * domain, or a removed one: ref ids are never reused, see migration 00058)
 */
export async function addApiServerDomain(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  api_server_id: string,
  new_domain: SchemaVaultsApiServerDomainRef,
  debug: boolean = false,
): Promise<void> {
  const parsed =
    await schemaVaultsApiServerDomainRefSchema.safeParseAsync(new_domain);
  if (!parsed.success) {
    throw new TypeError("Received invalid API server domain to associate with API server", {
      cause: parsed.error,
    });
  }
  const domain = parsed.data;

  if (api_server_id !== domain.api_server_id) {
    throw new TypeError("API server ID mismatch");
  }

  // The same domain may only be registered once per API server +
  // environment (the primary key is the ref id, so check explicitly).
  // Domains compare exactly: an apex domain and its www. subdomain are
  // separate registrations. Other API servers may register the same
  // domain: a verified registration (only the host's owner can verify
  // one) takes precedence over unverified ones.
  const existing = await getApiServerDomains(db, api_server_id, debug);
  assertDomainRegistrationAvailable(
    API_SERVER_DOMAIN_REGISTRATION_OWNER,
    existing.map((ref) => ({
      ref_id: ref.api_server_domain_ref_id,
      domain: ref.domain,
      environment: ref.environment,
    })),
    {
      ref_id: domain.api_server_domain_ref_id,
      domain: domain.domain,
      environment: domain.environment,
    },
  );

  try {
    // Every registration starts unverified, with its own token: its owner
    // proves control of the host to make it take precedence in RFC 8707
    // resource-URL resolution, and to keep it resolving once the
    // require_api_server_domain_verification server setting is on (see
    // lib/api-server-domain-verification/). The insert claims the ref id
    // for good (the api_server_domains_claim_ref_id trigger): an id that
    // was ever used, even by a removed domain, fails with a unique
    // violation.
    const result = await db
      .insertInto("api_server_domains")
      .values({
        ...domain,
        verification_token: generateDomainVerificationToken(),
        verified_at: null,
        verification_method: null,
      })
      .onConflict((oc) => oc.column("api_server_domain_ref_id").doNothing())
      .executeTakeFirst();

    if (result.numInsertedOrUpdatedRows === BigInt(0)) {
      // The ref id belongs to a domain of another API server
      throw domainRefIdUsedError(
        API_SERVER_DOMAIN_REGISTRATION_OWNER,
        domain.api_server_domain_ref_id,
      );
    }
  } catch (e: unknown) {
    if (e instanceof ConflictError) throw e;
    // The table's only unique constraint is the ref id, and the trigger's
    // claim of a used one is the other unique violation an insert can hit.
    if (isUniqueViolation(e)) {
      throw domainRefIdUsedError(
        API_SERVER_DOMAIN_REGISTRATION_OWNER,
        domain.api_server_domain_ref_id,
      );
    }
    console.error("Failed to add new API server domain; db insert failed: ", e);
    throw new Error("Failed to add new API server domain; db insert failed", { cause: e });
  }
}

export default addApiServerDomain;
