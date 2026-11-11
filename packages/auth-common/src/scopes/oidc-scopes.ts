import { OIDC_RESERVED_SCOPES, type OidcReservedScope } from "../oidc/scope-names";
import { defineScopes, type ScopeDefinition } from "./scope-definition";

/** What each OpenID Connect scope allows, as a person granting it reads it. */
const OIDC_SCOPE_DESCRIPTIONS = {
  openid: "Sign you in with OpenID Connect",
  profile: "Read your basic profile, such as your name",
  email: "Read your email address",
  address: "Read your postal address",
  phone: "Read your phone number",
  offline_access: "Keep access while you are not using the app (refresh tokens)",
} as const satisfies Record<OidcReservedScope, string>;

/**
 * The OpenID Connect scopes (`OIDC_RESERVED_SCOPES`, OpenID Connect Core
 * §5.4, §11) as definitions, keyed by their value: `oidcScopes.email`.
 *
 * Their values are reserved, so they never belong in an API server's scope
 * manifest: sync your own `defineScopes()` catalogue, not these.
 */
export const oidcScopes: { readonly [K in OidcReservedScope]: ScopeDefinition<K> } = defineScopes(
  Object.fromEntries(
    OIDC_RESERVED_SCOPES.map((scope) => [
      scope,
      { scope, description: OIDC_SCOPE_DESCRIPTIONS[scope] },
    ]),
  ) as { readonly [K in OidcReservedScope]: ScopeDefinition<K> },
);
