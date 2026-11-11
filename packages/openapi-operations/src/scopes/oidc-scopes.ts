import { defineScopes } from "./scope-definition";

/**
 * The OpenID Connect scopes (OpenID Connect Core 1.0 §5.4, §11), defined so
 * operations can require them with a description:
 * `requiredScopes: [oidcScopes.email]`.
 *
 * Their values are reserved by the auth server, so they never belong in an
 * API server's scope manifest: sync your own `defineScopes()` catalogue, not
 * these.
 */
export const oidcScopes = defineScopes({
  openid: { scope: "openid", description: "Sign you in with OpenID Connect" },
  profile: { scope: "profile", description: "Read your basic profile, such as your name" },
  email: { scope: "email", description: "Read your email address" },
  address: { scope: "address", description: "Read your postal address" },
  phone: { scope: "phone", description: "Read your phone number" },
  offline_access: {
    scope: "offline_access",
    description: "Keep access while you are not using the app (refresh tokens)",
  },
});
