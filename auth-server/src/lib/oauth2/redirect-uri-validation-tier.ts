// redirect-uri-validation-tier.ts
//
// Which allowlist an OAuth2 `redirect_uri` is checked against for a
// client application in one environment. Pure (no database, no
// `server-only`) so the decision can be unit tested and shown in the
// app detail page's callback URL card.

/**
 * - `exact_callback_urls`: the app has explicit callback URLs
 *   (APP_CALLBACK_URLS) in the environment; `redirect_uri` must match
 *   one of them exactly (http loopback URLs on any port, RFC 8252 §7.3).
 * - `registered_origins`: any path on a registered app domain is
 *   accepted. Only for hardcoded apps (the auth server's own app, whose
 *   domains come from the server's environment) and confidential
 *   clients.
 * - `refuse`: every `redirect_uri` is refused: a public client without
 *   an explicit callback URL in the environment.
 */
export type RedirectUriValidationTier =
  | "exact_callback_urls"
  | "registered_origins"
  | "refuse";

export interface RedirectUriValidationTierInputs {
  /** Whether at least one callback URL is registered for the environment. */
  has_callback_urls: boolean;
  /** Whether the app is a hardcoded app (no database row). */
  hardcoded: boolean;
  /** Whether the app has a client secret (a confidential client). */
  confidential: boolean;
}

/**
 * Pick the `redirect_uri` allowlist tier for an app in one environment.
 *
 * Origin matching is unsafe for public (PKCE-only) clients: an attacker
 * can start a flow with their own code verifier, point `redirect_uri` at
 * any path on the app's origin that leaks the code (an open redirect,
 * user content, a third-party script reading the Referer), send the link
 * to a user who has already consented, and redeem the code themselves.
 * A confidential client's code is useless without its client secret, and
 * the token endpoint binds the `redirect_uri`, so confidential clients
 * keep the origin fallback until they register callback URLs.
 */
export function resolveRedirectUriValidationTier({
  has_callback_urls,
  hardcoded,
  confidential,
}: RedirectUriValidationTierInputs): RedirectUriValidationTier {
  if (has_callback_urls) {
    return "exact_callback_urls";
  }
  if (hardcoded || confidential) {
    return "registered_origins";
  }
  return "refuse";
}

export default resolveRedirectUriValidationTier;
