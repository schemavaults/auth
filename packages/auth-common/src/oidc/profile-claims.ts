/**
 * OIDC Core §5.1 standard claims gated by the `profile` scope, built
 * from the user's stored profile name fields. Shared by every surface
 * that emits profile claims — the id_token (`generateIdToken` in
 * @schemavaults/jwt) and GET/POST /api/oidc/userinfo — so the two
 * always agree for the same user.
 */

/** The profile name fields the claims are derived from (all optional). */
export interface OidcProfileClaimsSource {
  username?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  display_name?: string;
}

/** The OIDC Core §5.1 claims emitted under the `profile` scope. */
export interface OidcProfileClaims {
  /**
   * The user's full name in displayable form: the public display name
   * when set, otherwise the joined first/middle/last name parts.
   */
  name?: string;
  given_name?: string;
  middle_name?: string;
  family_name?: string;
  preferred_username?: string;
}

/**
 * Builds the `profile`-scoped claim set from a user's stored name
 * fields. Claims without a stored value are omitted entirely (OIDC Core
 * §5.3.2 — absent, not null/empty). Callers are responsible for only
 * emitting the result when the `profile` scope was actually granted.
 */
export function buildOidcProfileClaims(
  user: OidcProfileClaimsSource,
): OidcProfileClaims {
  const claims: OidcProfileClaims = {};

  const joined_name_parts: string = [
    user.first_name,
    user.middle_name,
    user.last_name,
  ]
    .filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    )
    .join(" ");
  const full_name: string | undefined =
    user.display_name && user.display_name.length > 0
      ? user.display_name
      : joined_name_parts.length > 0
        ? joined_name_parts
        : undefined;

  if (full_name) {
    claims.name = full_name;
  }
  if (user.first_name) {
    claims.given_name = user.first_name;
  }
  if (user.middle_name) {
    claims.middle_name = user.middle_name;
  }
  if (user.last_name) {
    claims.family_name = user.last_name;
  }
  if (user.username) {
    claims.preferred_username = user.username;
  }

  return claims;
}
