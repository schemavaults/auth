/**
 * OIDC scope handling for the parallel OIDC surface.
 *
 * The platform's own authorization model is audience-based
 * (see audience-schema.ts / APP_TO_API_PERMISSIONS); OAuth2 scopes exist
 * only on the OIDC surface, where `openid` turns an authorization
 * request into an OpenID Connect authentication request (OIDC Core
 * §3.1.2.1: an id_token is minted and /userinfo opens up) and
 * `email`/`profile` gate which claims the id_token and /userinfo
 * response carry. A request WITHOUT `openid` — including one with no
 * `scope` at all (OPTIONAL per RFC 6749 §3.3) — is a plain OAuth 2.1
 * authorization grant: it yields access + refresh tokens only, no
 * id_token, and no identity claims (OIDC Core §3.1.2.1 leaves such
 * requests to OAuth 2.0 semantics). That is what OAuth-only clients such
 * as MCP clients send; they want a token for a resource server, not an
 * identity. Unknown scopes are silently dropped per RFC 6749 §3.3 (the
 * granted set is echoed back in the token response, so RPs that
 * hardcode e.g. "openid profile email address" still interoperate, and
 * a request naming only unknown scopes degrades to a plain OAuth grant).
 *
 * API scopes: an API server (resource server) may define its own scope
 * values (e.g. `notes:read`, see `api-scopes/`). They are granted only
 * when the authorization request names that API server as its RFC 8707
 * `resource` (`grantRequestedScopes`); without a resource they are
 * unknown scopes and dropped exactly as before.
 */

import { z } from "zod";

export const OIDC_OPENID_SCOPE = "openid" as const;

export const OIDC_SUPPORTED_SCOPES = ["openid", "email", "profile"] as const;

/**
 * The scope values OpenID Connect Core §5.4 / §11 standardize. No API
 * server may define one of them as an API scope (even those this server
 * does not support yet), so a granted scope string always splits
 * unambiguously into its OIDC part and its API part
 * (`partitionGrantedScopes`).
 */
export const OIDC_RESERVED_SCOPES = [
  "openid",
  "profile",
  "email",
  "address",
  "phone",
  "offline_access",
] as const;

export function isOidcReservedScope(scope: string): boolean {
  return (OIDC_RESERVED_SCOPES as readonly string[]).includes(scope);
}

/**
 * Scope requested by default when a flow does not name one explicitly:
 * the SDK's `authenticateWithRedirect`/`sendAuthenticateRequest`
 * default, and the AuthForm's fallback for entry URLs without a
 * `scope` parameter (e.g. the auth server's own /account flow).
 */
export const DEFAULT_AUTH_SCOPE = "openid email profile" as const;

const MAX_OIDC_SCOPE_LENGTH = 256 as const;

/**
 * RFC 6749 §3.3 wire format for the `scope` parameter:
 *   scope       = scope-token *( SP scope-token )
 *   scope-token = 1*( %x21 / %x23-5B / %x5D-7E )
 * i.e. one or more scope-tokens joined by a SINGLE space, where a
 * scope-token is printable ASCII excluding SP (the delimiter), `"`
 * (0x22) and `\` (0x5C), and all control chars. This rejects leading /
 * trailing / repeated spaces and any control / CR-LF that could pollute
 * logs or the token-response `scope` echo.
 */
export const OIDC_SCOPE_REGEX: RegExp =
  /^[\x21\x23-\x5B\x5D-\x7E]+(?: [\x21\x23-\x5B\x5D-\x7E]+)*$/;

/**
 * Validates the FORMAT of a raw `scope` request parameter (RFC 6749
 * §3.3, bounded length). Orthogonal to `parseAndGrantScopes`, which
 * decides which of the (well-formed) tokens the platform grants — a
 * value can be format-valid here yet grant nothing (all tokens
 * unsupported). Auth flows apply this at the request boundary before
 * deriving the granted set.
 */
export const oidcScopeSchema = z
  .string()
  .min(1)
  .max(MAX_OIDC_SCOPE_LENGTH)
  .regex(OIDC_SCOPE_REGEX, {
    message:
      "'scope' must be a space-delimited list of RFC 6749 §3.3 scope tokens",
  });

export type OidcScope = z.infer<typeof oidcScopeSchema>;

export type OidcSupportedScope = (typeof OIDC_SUPPORTED_SCOPES)[number];

export interface ParsedOidcScopes {
  /**
   * The intersection of the requested scopes with
   * OIDC_SUPPORTED_SCOPES, deduplicated, in request order.
   */
  granted: OidcSupportedScope[];
  /**
   * Whether the request included the `openid` scope, i.e. whether it is
   * an OpenID Connect authentication request (id_token + userinfo) as
   * opposed to a plain OAuth 2.1 authorization grant.
   */
  hasOpenid: boolean;
}

function isSupportedOidcScope(scope: string): scope is OidcSupportedScope {
  if (typeof scope !== "string" || scope.length === 0) {
    throw new TypeError("Expected 'scope' to be a non-empty string!");
  }
  return (OIDC_SUPPORTED_SCOPES as readonly string[]).includes(scope);
}

/**
 * Parses a raw `scope` request parameter (space-delimited per
 * RFC 6749 §3.3) into the granted subset. Non-string, empty, or
 * malformed input grants nothing — an empty granted set is a valid
 * outcome (a plain OAuth 2.1 grant); callers that need to distinguish a
 * malformed value from an absent one check `oidcScopeSchema` first.
 */
export function parseAndGrantScopes(raw: unknown): ParsedOidcScopes {
  if (typeof raw !== "string") {
    return { granted: [], hasOpenid: false };
  }

  if (!oidcScopeSchema.safeParse(raw).success) {
    return { granted: [], hasOpenid: false };
  }

  const granted: OidcSupportedScope[] = [];
  for (const token of raw.split(" ")) {
    if (!token) continue; // collapse repeated separators
    if (isSupportedOidcScope(token) && !granted.includes(token)) {
      granted.push(token);
    }
  }

  return { granted, hasOpenid: granted.includes(OIDC_OPENID_SCOPE) };
}

export interface GrantedScopes {
  /**
   * Every granted scope (OIDC and API scopes), deduplicated, in request
   * order.
   */
  granted: string[];
  /** The OIDC scopes among `granted` (see `parseAndGrantScopes`). */
  oidc: OidcSupportedScope[];
  /** The API scopes among `granted`. */
  api: string[];
  /** Whether `granted` includes `openid`. */
  hasOpenid: boolean;
}

/**
 * Like `parseAndGrantScopes`, but also grants the requested scopes that
 * `api_scopes` lists: the scope values defined by the API server the
 * grant's RFC 8707 `resource` resolved to. Every other scope is still
 * dropped (RFC 6749 §3.3), and so is any OIDC reserved name in
 * `api_scopes`. With no `api_scopes` the result grants exactly what
 * `parseAndGrantScopes` grants.
 */
export function grantRequestedScopes(
  raw: unknown,
  api_scopes: Iterable<string> = [],
): GrantedScopes {
  const { granted: oidc, hasOpenid } = parseAndGrantScopes(raw);
  const grantable_api_scopes = new Set<string>();
  for (const scope of api_scopes) {
    if (typeof scope === "string" && !isOidcReservedScope(scope)) {
      grantable_api_scopes.add(scope);
    }
  }
  if (
    grantable_api_scopes.size === 0 ||
    typeof raw !== "string" ||
    !oidcScopeSchema.safeParse(raw).success
  ) {
    return { granted: [...oidc], oidc, api: [], hasOpenid };
  }

  const granted: string[] = [];
  const api: string[] = [];
  for (const token of raw.split(" ")) {
    if (!token || granted.includes(token)) continue;
    if ((oidc as readonly string[]).includes(token)) {
      granted.push(token);
    } else if (grantable_api_scopes.has(token)) {
      granted.push(token);
      api.push(token);
    }
  }
  return { granted, oidc, api, hasOpenid };
}

/**
 * Splits a granted scope string (an authorization code row, a token's
 * `scope` claim) into its OIDC scopes and its API scopes. Only granted
 * sets are stored, and API scopes can never take an OIDC reserved name,
 * so every token that is not a supported OIDC scope is an API scope.
 * Null / empty is the empty grant (a plain OAuth 2.1 grant).
 */
export function partitionGrantedScopes(scope: string | null | undefined): {
  oidc: OidcSupportedScope[];
  api: string[];
} {
  const oidc: OidcSupportedScope[] = [];
  const api: string[] = [];
  if (typeof scope !== "string") {
    return { oidc, api };
  }
  for (const token of scope.split(" ")) {
    if (!token) continue;
    if (isSupportedOidcScope(token)) {
      if (!oidc.includes(token)) oidc.push(token);
    } else if (!isOidcReservedScope(token) && !api.includes(token)) {
      api.push(token);
    }
  }
  return { oidc, api };
}

/**
 * Serializes granted scopes back to the space-delimited wire format for
 * the token response `scope` field and the AUTHORIZATION_CODES row.
 */
export function serializeOidcScopes(scopes: readonly string[]): string {
  return scopes.join(" ");
}

/**
 * Serializes a granted set to its stored form on the AUTHORIZATION_CODES
 * row / MFA challenge / token claims: `null` when nothing was granted (a
 * plain OAuth 2.1 grant carries no `scope` — the wire format has no
 * representation for an empty list), else the space-delimited list.
 */
export function serializeOidcScopesOrNull(
  scopes: readonly string[],
): string | null {
  return scopes.length === 0 ? null : serializeOidcScopes(scopes);
}
