import "server-only";
import type { Kysely, Transaction } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import {
  type SchemaVaultsAppDomainRef,
  schemaVaultsAppDomainRefSchema,
} from "@schemavaults/app-definitions";
import { ConflictError } from "@/lib/error/ConflictError";
import {
  APP_DOMAIN_REGISTRATION_OWNER,
  assertDomainRegistrationAvailable,
  domainRefIdInUseError,
} from "@/lib/auth-db/domain-registrations/registration-conflicts";
import { getAppDomains } from "./get-app-domains";

/**
 * @description Registers a domain (an http(s) origin) to an app.
 * @throws ConflictError when the domain is already registered to this app
 * in that environment, or the ref id is in use
 */
export async function addAppDomain(
  db: Kysely<AuthDatabase> | Transaction<AuthDatabase>,
  app_id: string,
  new_app_domain: SchemaVaultsAppDomainRef,
): Promise<void> {

  const parsed =
    await schemaVaultsAppDomainRefSchema.safeParseAsync(new_app_domain);
  if (!parsed.success) {
    throw new TypeError("Received invalid app domain to associate with app", {
      cause: parsed.error,
    });
  }
  const app_domain = parsed.data;

  if (app_id !== app_domain.app_id) {
    throw new TypeError("App ID mismatch");
  }

  // The same domain may only be registered once per app + environment
  // (the primary key is the ref id, so this has to be checked explicitly).
  // Domains compare exactly: an apex domain and its www. subdomain are
  // separate registrations.
  const existing = await getAppDomains(db, app_id);
  assertDomainRegistrationAvailable(
    APP_DOMAIN_REGISTRATION_OWNER,
    existing.map((ref) => ({
      ref_id: ref.app_domain_ref_id,
      domain: ref.domain,
      environment: ref.environment,
    })),
    {
      ref_id: app_domain.app_domain_ref_id,
      domain: app_domain.domain,
      environment: app_domain.environment,
    },
  );

  try {
    const result = await db
      .insertInto("app_domains")
      .values(app_domain)
      .onConflict((oc) => oc.column("app_domain_ref_id").doNothing())
      .executeTakeFirst();

    if (result.numInsertedOrUpdatedRows === BigInt(0)) {
      // The ref id belongs to a domain of another app
      throw domainRefIdInUseError(
        APP_DOMAIN_REGISTRATION_OWNER,
        app_domain.app_domain_ref_id,
      );
    }
  } catch (e: unknown) {
    if (e instanceof ConflictError) throw e;
    console.error("Failed to add new app domain; db insert failed: ", e);
    throw new Error("Failed to add new app domain; db insert failed", { cause: e });
  }
}

export default addAppDomain;
