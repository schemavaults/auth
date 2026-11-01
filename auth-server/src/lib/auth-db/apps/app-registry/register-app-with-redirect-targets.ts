import "server-only";
import { randomUUID } from "node:crypto";
import type {
  InitialAppCallbackUrl,
  InitialAppDomain,
} from "@schemavaults/app-definitions";
import type { Kysely } from "@schemavaults/dbh";
import type { AuthDatabase } from "@/lib/auth-db/auth-database-types";
import { SchemaVaultsAppRegistry, type RegisterAppOptions } from "./app-registry";

export interface RegisterAppWithRedirectTargetsOptions {
  /** The app row to insert (see `SchemaVaultsAppRegistry.registerApp`). */
  app: RegisterAppOptions;
  /** Domains (http(s) origins) to register with the app. */
  initial_domains?: readonly InitialAppDomain[];
  /** Exact callback URLs to register with the app. */
  initial_callback_urls?: readonly InitialAppCallbackUrl[];
  /** Injectable for tests. */
  now?: () => number;
}

/**
 * @description Creates a client application together with the domains
 * and callback URLs it was requested with, in one transaction: if any of
 * them is refused (a duplicate, the app id already taken, a failed
 * insert) nothing is written, so an app is never left behind without the
 * redirect configuration it was created with. Domains are stored as their
 * canonical origin (`new URL(domain).origin`, the form browsers send in
 * `Origin`); callback URLs as given.
 * @throws ConflictError when the app id is taken or a row is a duplicate
 */
export async function registerAppWithRedirectTargets(
  db: Kysely<AuthDatabase>,
  {
    app,
    initial_domains = [],
    initial_callback_urls = [],
    now = Date.now,
  }: RegisterAppWithRedirectTargetsOptions,
): Promise<void> {
  const created_at: number = now();

  await db.transaction().execute(async (trx) => {
    const appRegistry = new SchemaVaultsAppRegistry(trx);

    await appRegistry.registerApp(app);

    for (const { domain, environment } of initial_domains) {
      await appRegistry.addAppDomain(app.app_id, {
        app_domain_ref_id: randomUUID(),
        app_id: app.app_id,
        domain: new URL(domain).origin,
        environment,
        created_at,
        hardcoded: false,
      });
    }

    for (const { callback_url, environment } of initial_callback_urls) {
      await appRegistry.addAppCallbackUrl(app.app_id, {
        app_callback_url_ref_id: randomUUID(),
        app_id: app.app_id,
        callback_url,
        environment,
        created_at,
      });
    }
  });
}

export default registerAppWithRedirectTargets;
