// validate-redirect-uri.ts
//
// Server-side validation of OAuth2 `redirect_uri` against a client
// application's registered allowlists. Centralised so that every
// authorization-code issuance path (login, register, MFA verify,
// generate-authorization-code), the OIDC authorize endpoint, and the
// page-render guard share one definition of "is this redirect_uri safe
// to issue a code for?".
//
// Two allowlist tiers:
//  1. Explicit callback URLs (APP_CALLBACK_URLS): when any are
//     registered for the app + environment, the redirect_uri must be an
//     exact match of one of them (RFC 6749 §3.1.2.3 simple string
//     comparison) — the registered origins are NOT consulted.
//  2. Origin fallback (APP_DOMAINS): when no explicit callback URLs are
//     registered, any path on a registered origin is accepted
//     (legacy/default behavior).

import "server-only";
import type { AppId, SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import { isRedirectUriInCallbackAllowlist } from "@schemavaults/auth-common";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import {
  getAppAllowedOriginsForEnvironment,
  isRedirectUriAllowedForClientApp,
} from "@/lib/cors/cors-for-client-app";

export interface ValidateRedirectUriOptions {
  redirect_uri: string;
  client_app_id: AppId;
  environment: SchemaVaultsAppEnvironment;
  dbh: ServerlessDatabase;
}

/**
 * Return whether `redirect_uri` is registered for the given app +
 * environment: an exact match of an explicit callback URL when any are
 * registered, otherwise an origin match against the registered
 * domains. A malformed URI returns false.
 */
export async function isRedirectUriRegisteredForClientApp({
  redirect_uri,
  client_app_id,
  environment,
  dbh,
}: ValidateRedirectUriOptions): Promise<boolean> {
  if (typeof redirect_uri !== "string" || redirect_uri.length === 0) {
    return false;
  }

  const appRegistry = new SchemaVaultsAppRegistry(dbh.db);
  const explicitCallbackUrls =
    await appRegistry.getAppCallbackUrlsForEnvironment(
      client_app_id,
      environment,
    );
  if (explicitCallbackUrls.length > 0) {
    return isRedirectUriInCallbackAllowlist(
      redirect_uri,
      explicitCallbackUrls.map((ref) => ref.callback_url),
    );
  }

  const allowedOrigins: readonly string[] =
    await getAppAllowedOriginsForEnvironment(
      client_app_id,
      environment,
      dbh,
    );
  return isRedirectUriAllowedForClientApp(redirect_uri, allowedOrigins);
}

export default isRedirectUriRegisteredForClientApp;
