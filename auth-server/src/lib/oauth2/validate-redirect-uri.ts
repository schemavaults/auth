// validate-redirect-uri.ts
//
// Server-side validation of OAuth2 `redirect_uri` against a client
// application's registered origin allowlist. Centralised so that every
// authorization-code issuance path (login, register, MFA verify,
// generate-authorization-code) and the page-render guard share one
// definition of "is this redirect_uri safe to issue a code for?".

import "server-only";
import type { AppId, SchemaVaultsAppEnvironment } from "@schemavaults/app-definitions";
import type { ServerlessDatabase } from "@/lib/auth-db";
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
 * Resolve the registered allowed-origins list for the given app +
 * environment and return whether `redirect_uri`'s origin appears in it.
 * A malformed URI returns false.
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
  const allowedOrigins: readonly string[] =
    await getAppAllowedOriginsForEnvironment(
      client_app_id,
      environment,
      dbh,
    );
  return isRedirectUriAllowedForClientApp(redirect_uri, allowedOrigins);
}

export default isRedirectUriRegisteredForClientApp;
