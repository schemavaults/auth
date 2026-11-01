// validate-redirect-uri.ts
//
// Server-side validation of OAuth2 `redirect_uri` against a client
// application's registered allowlists. Centralised so that every
// authorization-code issuance path (login, register, MFA verify,
// generate-authorization-code), the OIDC authorize endpoint, and the
// page-render guard share one definition of "is this redirect_uri safe
// to issue a code for?".
//
// Three tiers (see resolveRedirectUriValidationTier):
//  1. Explicit callback URLs (APP_CALLBACK_URLS): when any are
//     registered for the app + environment, the redirect_uri must be an
//     exact match of one of them (RFC 6749 §3.1.2.3 simple string
//     comparison) — the registered origins are NOT consulted. The one
//     relaxation is RFC 8252 §7.3: a registered http loopback URL
//     (127.0.0.1 / [::1]) matches on any port, because native apps
//     (CLI, desktop, MCP clients) only learn their port at runtime.
//  2. Origin fallback (APP_DOMAINS): when no explicit callback URLs are
//     registered, any path on a registered origin is accepted — but only
//     for hardcoded apps and confidential clients (a client secret is
//     needed to redeem the code, and the token endpoint binds the
//     redirect_uri).
//  3. Refusal: a public (PKCE-only) client without explicit callback
//     URLs gets no code at all. Origin matching would let an attacker
//     who starts the flow with their own code verifier receive a
//     consented user's code on any leaky path of the app's origin and
//     redeem it.

import "server-only";
import {
  isHardcodedAppId,
  type AppId,
  type SchemaVaultsAppEnvironment,
} from "@schemavaults/app-definitions";
import { isRedirectUriInCallbackAllowlist } from "@schemavaults/auth-common";
import type { ServerlessDatabase } from "@/lib/auth-db";
import { SchemaVaultsAppRegistry } from "@/lib/auth-db/apps";
import { resolveRedirectUriValidationTier } from "@/lib/oauth2/redirect-uri-validation-tier";
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
 * registered (port-agnostic for registered http loopback URLs, RFC 8252
 * §7.3); otherwise, for hardcoded apps and confidential clients only, an
 * origin match against the registered domains. A public client without
 * explicit callback URLs, and a malformed URI, return false.
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
  const hardcoded: boolean = isHardcodedAppId(client_app_id);
  const tier = resolveRedirectUriValidationTier({
    has_callback_urls: explicitCallbackUrls.length > 0,
    hardcoded,
    // Only looked up when it matters: without callback URLs.
    confidential:
      explicitCallbackUrls.length === 0 &&
      !hardcoded &&
      (await appRegistry.getClientSecretRecord(client_app_id)) !== null,
  });

  if (tier === "exact_callback_urls") {
    return isRedirectUriInCallbackAllowlist(
      redirect_uri,
      explicitCallbackUrls.map((ref) => ref.callback_url),
    );
  }
  if (tier === "refuse") {
    return false;
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
