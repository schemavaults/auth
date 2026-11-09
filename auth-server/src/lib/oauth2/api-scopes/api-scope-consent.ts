/**
 * The consent rules of authorization requests, as pure functions (shared
 * by `resolveAuthorizationCodeGrant()` and `describeAppConsentStatus()`).
 */

export interface DecideApiScopeConsentOptions {
  /** The requested API scopes the app may be granted (request order). */
  requested_api_scopes: readonly string[];
  /** The API scopes the user consented to (USER_APP_SCOPE_CONSENTS). */
  consented_api_scopes: readonly string[];
  /** Whether the app's connection to the API server is first-party. */
  first_party: boolean;
}

export interface ApiScopeConsentDecision {
  /** Requested scopes the code may carry (request order). */
  granted_api_scopes: string[];
  /** Requested scopes the consent screen must ask for (request order). */
  pending_api_scopes: string[];
  /**
   * Whether consent is implicit: the request asks for API scopes through a
   * first-party connection, so nothing is pending and minting the code
   * records the consent.
   */
  implicit_consent: boolean;
}

/**
 * Which requested API scopes are granted and which still need the user's
 * consent. Through a first-party connection (the app and the API server
 * belong to the same party) consent is implicit: every requested scope is
 * granted, whatever the user consented to so far. Otherwise only the
 * consented ones are; the rest are pending.
 */
export function decideApiScopeConsent({
  requested_api_scopes,
  consented_api_scopes,
  first_party,
}: DecideApiScopeConsentOptions): ApiScopeConsentDecision {
  const implicit_consent: boolean = first_party && requested_api_scopes.length > 0;
  if (implicit_consent) {
    return {
      granted_api_scopes: [...requested_api_scopes],
      pending_api_scopes: [],
      implicit_consent,
    };
  }
  const consented = new Set(consented_api_scopes);
  return {
    granted_api_scopes: requested_api_scopes.filter((scope) => consented.has(scope)),
    pending_api_scopes: requested_api_scopes.filter((scope) => !consented.has(scope)),
    implicit_consent,
  };
}

export interface IsConsentScreenRequiredOptions {
  /** The auth server's own app never needs consent. */
  is_auth_server_app: boolean;
  /** {@link ApiScopeConsentDecision.implicit_consent}. */
  implicit_consent: boolean;
  /** Whether the user authorized the app (AUTHORIZED_APPS). */
  authorized: boolean;
  /** How many requested API scopes still need the user's consent. */
  pending_api_scope_count: number;
}

/**
 * Whether the consent screen must be shown for an authorization request:
 * the app is not authorized yet, or the request asks for API scopes the
 * user has not consented to — never for the auth server's own app, nor for
 * a request whose consent is implicit (a first-party connection).
 */
export function isConsentScreenRequired({
  is_auth_server_app,
  implicit_consent,
  authorized,
  pending_api_scope_count,
}: IsConsentScreenRequiredOptions): boolean {
  if (is_auth_server_app || implicit_consent) {
    return false;
  }
  return !authorized || pending_api_scope_count > 0;
}
