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
 */

import { z } from "zod";

export const OIDC_OPENID_SCOPE = "openid" as const;

export const OIDC_SUPPORTED_SCOPES = ["openid", "email", "profile"] as const;

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
